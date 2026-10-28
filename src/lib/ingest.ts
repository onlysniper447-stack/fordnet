import { desc, eq, gt, inArray, lt, lte, sql } from "drizzle-orm";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { getRpc, RpcQuotaExhausted, RpcRateLimited } from "./rpc";
import { poolsFrom } from "./pools";
import type { Degraded, NetworkStatus, RpcBlock, RpcBlockchainInfo } from "./types";
import { INGEST_INTERVAL_MS, syncState } from "./state";
import { dbAvailable } from "./dbguard";
import { flushUsage } from "./rpc-budget";
export { syncState, LAG_THRESHOLD_SEC } from "./state";

const BLOCKS_PER_DAY = 1152; // 75s target spacing
const KEEP_BLOCKS = 100;
// Shared-tier RPC providers rate-limit; keep calls per run bounded.
const BACKFILL_DAYS = Number(process.env.POOL_BACKFILL_DAYS ?? 30);
const MAX_BACKFILL_PER_RUN = Number(process.env.POOL_BACKFILL_PER_RUN ?? 10);
const MAX_NEW_BLOCKS_PER_RUN = Number(process.env.MAX_NEW_BLOCKS_PER_RUN ?? (process.env.VERCEL ? 30 : 100));

export interface IngestResult { height: number; newBlocks: number; poolDaysWritten: number; blockErrors: number; mocked: boolean; }

let running: Promise<IngestResult> | null = null;
export interface IngestOptions { maxNewBlocks?: number; maxBackfillPerRun?: number; budgetMs?: number }
export function runIngest(opts: IngestOptions = {}): Promise<IngestResult> {
  running ??= doIngest(opts).finally(() => { running = null; });
  return running;
}

async function storeBlock(b: RpcBlock) {
  const v = { hash: b.hash, time: b.time, size: b.size ?? null, txCount: b.tx.length, raw: JSON.stringify(b) };
  await (await getDb()).insert(schema.blocks).values({ height: b.height, ...v }).onConflictDoUpdate({ target: schema.blocks.height, set: v });
}

const utcDate = (unixSec: number) => new Date(unixSec * 1000).toISOString().slice(0, 10);

async function storePoolDay(b: RpcBlock, takenAt: number) {
  const p = poolsFrom(b.valuePools);
  await (await getDb()).insert(schema.poolSnapshots).values({ date: utcDate(b.time), height: b.height, takenAt, ...p })
    .onConflictDoUpdate({ target: schema.poolSnapshots.date, set: { height: b.height, takenAt, ...p } });
}

/**
 * getblockchaininfo is the heaviest essential call and the one GetBlock's shared tier times out on.
 * On failure confirm reachability with the light getblockcount + getbestblockhash and reuse the
 * slow-moving fields (difficulty, pools) from the previous snapshot.
 */
async function essentials(rpc: ReturnType<typeof getRpc>, db: Awaited<ReturnType<typeof getDb>>): Promise<RpcBlockchainInfo> {
  try { return await rpc.getBlockchainInfo(); }
  catch (e) {
    if (e instanceof RpcRateLimited && (e.status === 429 || e.status === 402)) throw e;
    const blocks = await rpc.getBlockCount();
    const bestblockhash = await rpc.getBestBlockHash();
    const [prev] = await db.select().from(schema.statusSnapshots).orderBy(desc(schema.statusSnapshots.takenAt)).limit(1);
    const p = prev ? (JSON.parse(prev.json) as NetworkStatus) : null;
    console.warn(`[ingest] getblockchaininfo failed (${e instanceof Error ? e.message : String(e)}); used getblockcount/getbestblockhash`);
    return { chain: p?.chain ?? "main", blocks, bestblockhash, difficulty: p?.difficulty ?? undefined, verificationprogress: p?.verificationProgress ?? undefined };
  }
}

async function doIngest(opts: IngestOptions): Promise<IngestResult> {
  const maxNew = opts.maxNewBlocks ?? MAX_NEW_BLOCKS_PER_RUN;
  const maxBackfill = opts.maxBackfillPerRun ?? MAX_BACKFILL_PER_RUN;
  const budgetMs = opts.budgetMs ?? 20_000; // stop optional work early; the provider can be slow
  const rpc = getRpc();
  const db = await getDb();
  const now = Date.now();
  const overBudget = () => Date.now() - now > budgetMs;

  // 1) essentials first: chain info, tip block, status snapshot. Freshness recovers even if the rest is slow.
  const info = await essentials(rpc, db);
  const tip = info.blocks;
  const solps = await rpc.getNetworkSolPs();
  const mining = solps === null ? await rpc.getMiningInfo().catch(() => null) : null;
  const [tipRow] = await db.select().from(schema.blocks).where(eq(schema.blocks.height, tip)).limit(1);
  let tipBlock: RpcBlock | null = tipRow && tipRow.hash === info.bestblockhash ? (JSON.parse(tipRow.raw) as RpcBlock) : null;
  let newBlocks = 0;
  if (!tipBlock) {
    // tip fetched separately with its own retry; a light verbosity-1 read is enough for time/tx count/pools
    for (let i = 0; i < 2 && !tipBlock; i++) {
      tipBlock = await rpc.getBlock(String(tip), i === 0 ? 2 : 1).catch((e: unknown) => { if (e instanceof RpcRateLimited && (e.status === 429 || e.status === 402)) throw e; return null; });
    }
    if (tipBlock) { await storeBlock(tipBlock); newBlocks++; }
  }
  const status: NetworkStatus = {
    state: syncState(tipBlock?.time ?? null, tip, info.headers ?? null, now),
    live: true, mocked: rpc.mocked, chain: info.chain, height: tip, headers: info.headers ?? null,
    bestBlockHash: info.bestblockhash, hashrateSolPerSec: solps ?? mining?.networksolps ?? null,
    difficulty: info.difficulty ?? mining?.difficulty ?? null, lastBlockTime: tipBlock?.time ?? null,
    lastBlockTxCount: tipBlock?.tx.length ?? null, verificationProgress: info.verificationprogress ?? null,
    pools: poolsFrom(info.valuePools ?? tipBlock?.valuePools), snapshotAt: now, degraded: null,
  };
  await db.insert(schema.statusSnapshots).values({ takenAt: now, json: JSON.stringify(status) });
  await db.insert(schema.meta).values({ key: "lastIngestAt", value: String(now) })
    .onConflictDoUpdate({ target: schema.meta.key, set: { value: String(now) } });
  let poolDaysWritten = 0;
  // one pool row per UTC day: write today's only when missing or > 6h old (fewer writes)
  if (tipBlock) {
    const [today] = await db.select({ takenAt: schema.poolSnapshots.takenAt }).from(schema.poolSnapshots).where(eq(schema.poolSnapshots.date, utcDate(tipBlock.time))).limit(1);
    if (!today || now - today.takenAt > 6 * 3600_000) { await storePoolDay(tipBlock, now); poolDaysWritten++; }
  }

  // 2) best effort: fill the last 100 blocks newest-first (re-check a 10-block reorg window), within budget
  const stored = new Map((await db.select({ h: schema.blocks.height, hash: schema.blocks.hash }).from(schema.blocks)
    .where(gt(schema.blocks.height, tip - KEEP_BLOCKS))).map((r) => [r.h, r.hash]));
  let blockErrors = 0;
  for (let h = tip - 1; h > tip - KEEP_BLOCKS && h >= 0 && !overBudget(); h--) {
    const existing = stored.get(h);
    if (existing && h < tip - 10) continue;
    let b: RpcBlock | null;
    try { b = await rpc.getBlock(String(h)); }
    catch (e) { if (e instanceof RpcRateLimited && (e.status === 429 || e.status === 402)) throw e; blockErrors++; break; }
    if (!b) continue;
    if (existing !== b.hash) { await storeBlock(b); newBlocks++; }
    if (newBlocks >= maxNew) break; // remaining history fills on later runs
  }
  await db.delete(schema.blocks).where(lte(schema.blocks.height, tip - KEEP_BLOCKS)); // keep the last 100 only
  await db.delete(schema.statusSnapshots).where(lt(schema.statusSnapshots.takenAt, now - 86400_000));
  await db.delete(schema.rpcCache).where(lt(schema.rpcCache.fetchedAt, now - 86400_000));
  await db.delete(schema.rateLimits).where(lt(schema.rateLimits.day, utcDate(now / 1000 - 86400))); // yesterday and older

  // 3) best effort: backfill daily pool snapshots from real block valuePools, within budget
  const have = new Set((await db.select({ d: schema.poolSnapshots.date }).from(schema.poolSnapshots)).map((r) => r.d));
  for (let d = 1; d <= BACKFILL_DAYS && !overBudget(); d++) {
    const h = tip - d * BLOCKS_PER_DAY;
    if (h < 0 || poolDaysWritten > maxBackfill) break;
    if (have.has(utcDate(now / 1000 - d * 86400))) continue;
    const b = await rpc.getBlock(String(h), 1).catch(() => null);
    if (!b) break;
    if (have.has(utcDate(b.time))) continue;
    await storePoolDay(b, now); have.add(utcDate(b.time)); poolDaysWritten++;
  }
  return { height: tip, newBlocks, poolDaysWritten, blockErrors, mocked: rpc.mocked };
}

export async function lastIngestAt(): Promise<number | null> {
  const [r] = await (await getDb()).select().from(schema.meta).where(eq(schema.meta.key, "lastIngestAt")).limit(1);
  return r ? Number(r.value) : null;
}

const LEASE_MS = 120_000; // longer than any run; runs are 5 min apart anyway
const RATE_LIMIT_BACKOFF_MS = 30_000; // shared-tier hiccups clear quickly; retry soon
const UNREACHABLE_BACKOFF_MS = 20_000;

async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.insert(schema.meta).values({ key, value }).onConflictDoUpdate({ target: schema.meta.key, set: { value } });
}

/** Atomic cross-instance lease: only one serverless instance ingests per window. */
async function acquireLease(now: number): Promise<boolean> {
  const db = await getDb();
  const until = String(now + LEASE_MS);
  const rows = await db.insert(schema.meta).values({ key: "ingestLease", value: until })
    .onConflictDoUpdate({ target: schema.meta.key, set: { value: until }, setWhere: sql`${schema.meta.value}::bigint < ${now}` })
    .returning({ key: schema.meta.key });
  return rows.length > 0;
}

/** Last provider failure, persisted so every instance backs off and the UI can explain it. */
export async function rpcHealth(): Promise<Degraded | null> {
  const db = await getDb();
  const [r] = await db.select().from(schema.meta).where(eq(schema.meta.key, "rpcHealth")).limit(1);
  if (!r || !r.value) return null;
  return JSON.parse(r.value) as Degraded;
}

async function recordFailure(e: unknown, now: number) {
  const prev = await rpcHealth().catch(() => null);
  if (e instanceof RpcQuotaExhausted) {
    const d: Degraded = { reason: "quota_exhausted", since: prev?.since ?? now, retryAt: e.resetAt, detail: "Node provider daily quota used up (HTTP 402)" };
    await setMeta("rpcHealth", JSON.stringify(d));
    console.warn(`[ingest] quota_exhausted; next attempt ${new Date(e.resetAt).toISOString()}`);
    return;
  }
  const limited = e instanceof RpcRateLimited && e.status === 429;
  const providerErr = e instanceof RpcRateLimited && e.status !== 429;
  const ra = e instanceof RpcRateLimited ? e.retryAfterSec : null;
  const wait = ra ? ra * 1000 : limited ? RATE_LIMIT_BACKOFF_MS : UNREACHABLE_BACKOFF_MS;
  const detail = (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "[url]").slice(0, 300);
  const d: Degraded = { reason: limited ? "rate_limited" : providerErr ? "provider_error" : "unreachable", since: prev?.since ?? now, retryAt: now + wait, detail };
  await setMeta("rpcHealth", JSON.stringify(d));
  console.warn(`[ingest] ${d.reason}: ${e instanceof Error ? e.message : String(e)}; next attempt ${new Date(d.retryAt ?? now).toISOString()}`);
}

/** Lease + backoff aware ingest. Used by page/API reads, the cron route and the worker. */
export async function ingestIfDue(opts: IngestOptions & { maxAgeMs?: number; force?: boolean } = {}): Promise<IngestResult | null> {
  const now = Date.now();
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.meta).where(inArray(schema.meta.key, ["lastIngestAt", "rpcHealth"]));
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const last = Number(m.get("lastIngestAt") ?? 0);
    if (!opts.force && now - last < (opts.maxAgeMs ?? INGEST_INTERVAL_MS)) return null;
    const health = m.get("rpcHealth") ? (JSON.parse(m.get("rpcHealth") as string) as Degraded) : null;
    // provider told us to back off; a daily-quota lockout of the primary doesn't stop the fallback endpoint
    const fallbackCovers = health?.reason === "quota_exhausted" && Boolean(process.env.ZCASH_RPC_URL_FALLBACK);
    if (health?.retryAt && now < health.retryAt && !fallbackCovers) return null;
    if (!(await acquireLease(now))) return null; // another instance is ingesting
    const r = await runIngest(opts);
    if (health) await setMeta("rpcHealth", "");
    return r;
  } catch (e) {
    await recordFailure(e, now).catch(() => undefined);
    if (opts.force) throw e;
    return null;
  }
}

/** Never blocks a page/API response on the provider: refresh runs after the response is sent. */
let nextCheckAt = 0; // per-instance: don't even read meta from the DB more than once a minute
export async function ensureFresh(maxAgeMs = INGEST_INTERVAL_MS): Promise<void> {
  if (!dbAvailable()) return; // nowhere to store results
  if (Date.now() < nextCheckAt) return;
  nextCheckAt = Date.now() + 60_000;
  const flush = () => flushUsage(async (key, n) => { // one cheap upsert per pool per instance per minute
    const [r] = await (await getDb()).insert(schema.meta).values({ key, value: String(n) })
      .onConflictDoUpdate({ target: schema.meta.key, set: { value: sql`(${schema.meta.value}::bigint + ${n})::text` } }).returning({ value: schema.meta.value });
    return Number(r.value);
  });
  try { after(flush); } catch { void flush(); }
  try {
    after(() => ingestIfDue({ maxAgeMs }));
  } catch {
    // Outside a request scope. In the Next.js server never block a render on the node:
    // fire and forget. Only standalone scripts (no NEXT_RUNTIME) wait for the ingest.
    if (process.env.NEXT_RUNTIME) void ingestIfDue({ maxAgeMs }).catch(() => undefined);
    else await ingestIfDue({ maxAgeMs });
  }
}

export async function latestSnapshot(): Promise<NetworkStatus | null> {
  const [r] = await (await getDb()).select().from(schema.statusSnapshots).orderBy(desc(schema.statusSnapshots.takenAt)).limit(1);
  return r ? (JSON.parse(r.json) as NetworkStatus) : null;
}
