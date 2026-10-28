import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getRpc } from "./rpc";
import { poolsFrom } from "./pools";
import type { NetworkStatus, RpcBlock, SyncState } from "./types";

const BLOCKS_PER_DAY = 1152; // 75s target spacing
const KEEP_BLOCKS = 100;
// Shared-tier RPC providers rate-limit; keep calls per run bounded.
const BACKFILL_DAYS = Number(process.env.POOL_BACKFILL_DAYS ?? 30);
const MAX_BACKFILL_PER_RUN = Number(process.env.POOL_BACKFILL_PER_RUN ?? 10);
const MAX_NEW_BLOCKS_PER_RUN = Number(process.env.MAX_NEW_BLOCKS_PER_RUN ?? (process.env.VERCEL ? 30 : 100));

export function syncState(lastBlockTime: number | null, height: number | null, headers: number | null, nowMs = Date.now()): SyncState {
  if (height === null || lastBlockTime === null) return "unreachable";
  const lagSec = nowMs / 1000 - lastBlockTime;
  if (lagSec < 120 && (headers === null || headers - height <= 2)) return "synced";
  return "lagging";
}

export interface IngestResult { height: number; newBlocks: number; poolDaysWritten: number; mocked: boolean; }

let running: Promise<IngestResult> | null = null;
export function runIngest(): Promise<IngestResult> {
  running ??= doIngest().finally(() => { running = null; });
  return running;
}

function storeBlock(b: RpcBlock) {
  getDb().insert(schema.blocks).values({ height: b.height, hash: b.hash, time: b.time, size: b.size ?? null, txCount: b.tx.length, raw: JSON.stringify(b) })
    .onConflictDoUpdate({ target: schema.blocks.height, set: { hash: b.hash, time: b.time, size: b.size ?? null, txCount: b.tx.length, raw: JSON.stringify(b) } }).run();
}

const utcDate = (unixSec: number) => new Date(unixSec * 1000).toISOString().slice(0, 10);

function storePoolDay(b: RpcBlock, takenAt: number) {
  const p = poolsFrom(b.valuePools);
  getDb().insert(schema.poolSnapshots).values({ date: utcDate(b.time), height: b.height, takenAt, ...p })
    .onConflictDoUpdate({ target: schema.poolSnapshots.date, set: { height: b.height, takenAt, ...p } }).run();
}

async function doIngest(): Promise<IngestResult> {
  const rpc = getRpc();
  const db = getDb();
  const now = Date.now();
  const [info, mining, solps] = await Promise.all([rpc.getBlockchainInfo(), rpc.getMiningInfo().catch(() => null), rpc.getNetworkSolPs()]);
  const tip = info.blocks;

  // 1) last 100 blocks first, newest first, skipping ones already stored with the same hash
  let newBlocks = 0;
  let tipBlock: RpcBlock | null = null;
  for (let h = tip; h > tip - KEEP_BLOCKS && h >= 0; h--) {
    const existing = db.select({ hash: schema.blocks.hash }).from(schema.blocks).where(eq(schema.blocks.height, h)).get();
    if (existing && h < tip - 10) break; // older range already present (reorg window: 10)
    const b = await rpc.getBlock(String(h));
    if (!b) continue;
    if (h === tip) tipBlock = b;
    if (!existing || existing.hash !== b.hash) { storeBlock(b); newBlocks++; }
    if (newBlocks >= MAX_NEW_BLOCKS_PER_RUN) break; // remaining history fills on later runs
  }
  db.delete(schema.blocks).where(sql`${schema.blocks.height} <= ${tip - KEEP_BLOCKS * 5}`).run();
  tipBlock ??= await rpc.getBlock(String(tip));

  // 2) status snapshot
  const status: NetworkStatus = {
    state: syncState(tipBlock?.time ?? null, tip, info.headers ?? null, now),
    live: true, mocked: rpc.mocked, chain: info.chain, height: tip, headers: info.headers ?? null,
    bestBlockHash: info.bestblockhash, hashrateSolPerSec: solps ?? mining?.networksolps ?? null,
    difficulty: info.difficulty ?? mining?.difficulty ?? null, lastBlockTime: tipBlock?.time ?? null,
    lastBlockTxCount: tipBlock?.tx.length ?? null, verificationProgress: info.verificationprogress ?? null,
    pools: poolsFrom(info.valuePools), snapshotAt: now,
  };
  db.insert(schema.statusSnapshots).values({ takenAt: now, json: JSON.stringify(status) }).run();
  db.delete(schema.statusSnapshots).where(sql`${schema.statusSnapshots.takenAt} < ${now - 7 * 86400_000}`).run();

  // 3) daily pool snapshots: today from the tip block, then backfill past days from real block valuePools
  let poolDaysWritten = 0;
  if (tipBlock) { storePoolDay(tipBlock, now); poolDaysWritten++; }
  const have = new Set(db.select({ d: schema.poolSnapshots.date }).from(schema.poolSnapshots).all().map((r) => r.d));
  for (let d = 1; d <= BACKFILL_DAYS; d++) {
    const h = tip - d * BLOCKS_PER_DAY;
    if (h < 0 || poolDaysWritten > MAX_BACKFILL_PER_RUN) break;
    const approxDate = utcDate(now / 1000 - d * 86400);
    if (have.has(approxDate)) continue;
    const b = await rpc.getBlock(String(h), 1).catch(() => null);
    if (!b || have.has(utcDate(b.time))) continue;
    storePoolDay(b, now); have.add(utcDate(b.time)); poolDaysWritten++;
  }
  db.insert(schema.meta).values({ key: "lastIngestAt", value: String(now) })
    .onConflictDoUpdate({ target: schema.meta.key, set: { value: String(now) } }).run();
  return { height: tip, newBlocks, poolDaysWritten, mocked: rpc.mocked };
}

export function lastIngestAt(): number | null {
  const r = getDb().select().from(schema.meta).where(eq(schema.meta.key, "lastIngestAt")).get();
  return r ? Number(r.value) : null;
}

/** On serverless (no always-on worker) refresh lazily if data is older than maxAgeMs. */
export async function ensureFresh(maxAgeMs = 60_000): Promise<void> {
  const last = lastIngestAt();
  if (last !== null && Date.now() - last < maxAgeMs) return;
  try { await runIngest(); } catch { /* node down: callers fall back to snapshots */ }
}

export function latestSnapshot(): NetworkStatus | null {
  const r = getDb().select().from(schema.statusSnapshots).orderBy(desc(schema.statusSnapshots.takenAt)).limit(1).get();
  return r ? (JSON.parse(r.json) as NetworkStatus) : null;
}
