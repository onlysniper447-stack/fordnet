import { desc, eq, gte } from "drizzle-orm";
import { after } from "next/server";
import { getDb, schema } from "@/db";
import { getRpc } from "./rpc";
import { ensureFresh, latestSnapshot, rpcHealth } from "./ingest";
import { deriveState, syncState } from "./state";
import { dbAvailable, storageNote, StorageUnavailable, withDb } from "./dbguard";
import { poolsFrom } from "./pools";
import type { AddressInfo, BlockDetail, BlockSummary, NetworkStatus, PoolPoint, PoolRange, RpcBlock, RpcTx, TxDetail, TxSummary } from "./types";

const EMPTY_POOLS = { transparent: null, sprout: null, sapling: null, orchard: null, lockbox: null, ironwood: null };


let statusCache: { at: number; v: NetworkStatus } | null = null;
/** Served from the DB snapshot written by ingest; no per-request RPC. */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (statusCache && Date.now() - statusCache.at < 30_000) return statusCache.v;
  const v = await buildStatus();
  statusCache = { at: Date.now(), v };
  return v;
}
async function buildStatus(): Promise<NetworkStatus> {
  return withDb(fromDb, () => liveStatus());
}

let liveCache: { at: number; v: NetworkStatus } | null = null;
let liveInflight: Promise<NetworkStatus> | null = null;
/** Database down: read the tip straight from the node (memoised 30s, single-flight per instance). */
async function liveStatus(): Promise<NetworkStatus> {
  if (liveCache && Date.now() - liveCache.at < 30_000) return { ...liveCache.v, storage: storageNote() };
  liveInflight ??= (async () => {
    const rpc = getRpc();
    try {
      const info = await rpc.getBlockchainInfo().catch(async (e: unknown) => {
        console.warn(`[live] getblockchaininfo failed, retrying once: ${e instanceof Error ? e.message : String(e)}`);
        await new Promise((r) => setTimeout(r, 1000));
        return rpc.getBlockchainInfo();
      });
      const tip = await rpc.getBlock(String(info.blocks), 1).catch(() => null);
      const solps = await rpc.getNetworkSolPs().catch(() => null);
      const now = Date.now();
      const v: NetworkStatus = {
        state: syncState(tip?.time ?? null, info.blocks, info.headers ?? null, now), live: true, mocked: rpc.mocked, chain: info.chain,
        height: info.blocks, headers: info.headers ?? null, bestBlockHash: info.bestblockhash, hashrateSolPerSec: solps, difficulty: info.difficulty ?? null,
        lastBlockTime: tip?.time ?? null, lastBlockTxCount: tip?.tx.length ?? null, verificationProgress: info.verificationprogress ?? null,
        pools: poolsFrom(info.valuePools ?? tip?.valuePools), snapshotAt: now, degraded: null, providerNote: null, storage: storageNote(),
      };
      liveCache = { at: now, v };
      return v;
    } catch (e) {
      console.warn(`[live] node unreachable: ${(e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "[url]")}`);
      const health = { reason: "unreachable" as const, since: liveCache?.v.snapshotAt ?? null, retryAt: Date.now() + 30_000, detail: (e instanceof Error ? e.message : String(e)).replace(/https?:\/\/\S+/g, "[url]").slice(0, 200) };
      const base = liveCache?.v ?? { mocked: rpc.mocked, chain: null, height: null, headers: null, bestBlockHash: null, hashrateSolPerSec: null, difficulty: null, lastBlockTime: null, lastBlockTxCount: null, verificationProgress: null, pools: EMPTY_POOLS, snapshotAt: null };
      return { ...base, ...deriveState(base, health), storage: storageNote() } as NetworkStatus;
    }
  })().finally(() => { liveInflight = null; });
  return liveInflight;
}

let tipCache: { at: number; height: number; hash: string; time: number; txCount: number } | null = null;
/** Cheap live tip for the pill between 5-min ingests: getblockcount (+ one getblock v1 only when the tip moved). Memoised 60s. */
async function liveTip(known: NetworkStatus | null) {
  if (tipCache && Date.now() - tipCache.at < 60_000) return tipCache;
  const rpc = getRpc();
  const height = await rpc.getBlockCount();
  if (tipCache && tipCache.height === height) return (tipCache = { ...tipCache, at: Date.now() });
  if (known && known.height === height && known.bestBlockHash && known.lastBlockTime !== null && known.lastBlockTxCount !== null)
    return (tipCache = { at: Date.now(), height, hash: known.bestBlockHash, time: known.lastBlockTime, txCount: known.lastBlockTxCount });
  const b = await rpc.getBlock(String(height), 1);
  if (!b) throw new Error("tip block not found");
  return (tipCache = { at: Date.now(), height, hash: b.hash, time: b.time, txCount: b.tx.length });
}

let snapCache: { at: number; snap: NetworkStatus | null; health: Awaited<ReturnType<typeof rpcHealth>> } | null = null;
async function fromDb(): Promise<NetworkStatus> {
  await ensureFresh();
  if (!snapCache || Date.now() - snapCache.at > 60_000) { // stored snapshot changes every 5 min; read it at most once a minute
    const [s, h] = await Promise.all([latestSnapshot(), rpcHealth().catch(() => null)]);
    snapCache = { at: Date.now(), snap: s, health: h };
  }
  let { snap } = snapCache; const { health } = snapCache;
  if (snap && snap.snapshotAt !== null && Date.now() - snap.snapshotAt > 90_000) {
    // overlay the live tip so the pill reflects the chain now, not the last ingest
    const t = await liveTip(snap).catch(() => null);
    if (t) snap = { ...snap, height: t.height, headers: t.height > (snap.headers ?? 0) ? t.height : snap.headers, bestBlockHash: t.hash, lastBlockTime: t.time, lastBlockTxCount: t.txCount, snapshotAt: t.at };
  }
  const d = deriveState(snap, health);
  if (!snap || snap.snapshotAt === null) {
    return { mocked: getRpc().mocked, chain: null, height: null, headers: null, bestBlockHash: null, hashrateSolPerSec: null, difficulty: null, lastBlockTime: null, lastBlockTxCount: null, verificationProgress: null, pools: EMPTY_POOLS, snapshotAt: null, ...d };
  }
  return { ...snap, ...d };
}

/** Read-through cache in Postgres so repeat lookups don't hit the RPC provider. Serves stale on failure. */
async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T | null>): Promise<T | null> {
  type Row = { value: string; fetchedAt: number } | undefined;
  const row = await withDb<Row>(async () => (await (await getDb()).select().from(schema.rpcCache).where(eq(schema.rpcCache.key, key)).limit(1))[0], () => undefined);
  if (!dbAvailable()) { // storage down: per-instance memory cache only
    const m = memCache.get(key);
    if (m && Date.now() - m.at < ttlMs) return m.v as T;
    const v = await fetcher();
    if (v !== null) { memCache.set(key, { at: Date.now(), v }); if (memCache.size > 500) memCache.delete(memCache.keys().next().value as string); }
    return v;
  }
  const refresh = async (): Promise<T | null> => {
    const v = await fetcher();
    const db = await getDb();
    if (v !== null) {
      const value = JSON.stringify(v); const fetchedAt = Date.now();
      if (value.length > MAX_CACHE_BYTES) return v; // too big for the shared cache (free-tier storage)
      await db.insert(schema.rpcCache).values({ key, value, fetchedAt }).onConflictDoUpdate({ target: schema.rpcCache.key, set: { value, fetchedAt } });
    }
    return v;
  };
  if (row) {
    // Stale-while-revalidate: never make a reader wait on the node when we hold a copy.
    if (Date.now() - row.fetchedAt >= ttlMs && !refreshing.has(key)) {
      refreshing.add(key);
      const job = () => refresh().catch(() => null).finally(() => refreshing.delete(key));
      try { after(job); } catch { void job(); }
    }
    return JSON.parse(row.value) as T;
  }
  return refresh();
}
const refreshing = new Set<string>();
const memCache = new Map<string, { at: number; v: unknown }>();
const MAX_CACHE_BYTES = 128_000;

let recentCache: { at: number; v: BlockSummary[] } | null = null;
export async function getRecentBlocks(limit: number): Promise<BlockSummary[]> {
  return withDb(() => recentFromDb(limit), async () => {
    if (recentCache && Date.now() - recentCache.at < 60_000 && recentCache.v.length >= Math.min(limit, 10)) return recentCache.v.slice(0, limit);
    const rpc = getRpc(); const tip = (await liveStatus()).height;
    if (tip === null) throw new Error("node unreachable");
    const out: BlockSummary[] = [];
    for (let h = tip; h > tip - Math.min(limit, 10) && h >= 0; h--) { // capped: gentle on the shared node
      const b = await rpc.getBlock(String(h), 1).catch(() => null);
      if (b) out.push({ height: b.height, hash: b.hash, time: b.time, size: b.size ?? null, txCount: b.tx.length });
    }
    recentCache = { at: Date.now(), v: out };
    return out;
  });
}
const recentDbCache = new Map<number, { at: number; v: BlockSummary[] }>();
async function recentFromDb(limit: number): Promise<BlockSummary[]> {
  const c = recentDbCache.get(limit);
  if (c && Date.now() - c.at < 60_000) return c.v;
  const v = await recentQuery(limit);
  recentDbCache.set(limit, { at: Date.now(), v });
  return v;
}
async function recentQuery(limit: number): Promise<BlockSummary[]> {
  await ensureFresh();
  return (await getDb()).select({ height: schema.blocks.height, hash: schema.blocks.hash, time: schema.blocks.time, size: schema.blocks.size, txCount: schema.blocks.txCount })
    .from(schema.blocks).orderBy(desc(schema.blocks.height)).limit(limit);
}

function summarizeTx(t: RpcTx): TxSummary {
  return {
    txid: t.txid, coinbase: t.vin.some((v) => v.coinbase !== undefined),
    transparentInputs: t.vin.filter((v) => v.coinbase === undefined).length,
    transparentOutputs: t.vout.length,
    transparentOutputTotal: Math.round(t.vout.reduce((a, o) => a + o.value, 0) * 1e8) / 1e8,
    shieldedComponents: (t.vShieldedSpend?.length ?? 0) + (t.vShieldedOutput?.length ?? 0) + (t.orchard?.actions?.length ?? 0) + (t.vjoinsplit?.length ?? 0),
  };
}

export async function getBlockDetail(id: string): Promise<BlockDetail | null> {
  const isHeight = /^\d+$/.test(id);
  const row = await withDb(async () => (await (await getDb()).select().from(schema.blocks).where(isHeight ? eq(schema.blocks.height, Number(id)) : eq(schema.blocks.hash, id)).limit(1))[0], () => undefined);
  if (!row && isHeight) { // far above the known tip: not found without spending an RPC call (works while the node is out of quota)
    const known = await withDb(async () => (await latestSnapshot())?.height ?? null, () => liveCache?.v.height ?? null);
    if (known !== null && Number(id) > known + 1000) return null;
  }
  const b: RpcBlock | null = row ? (JSON.parse(row.raw) as RpcBlock) : await cached(`block:${id}`, 10 * 60_000, () => getRpc().getBlock(id));
  if (!b) return null;
  const tip = await withDb(async () => (await latestSnapshot())?.height ?? null, async () => (await liveStatus()).height);
  return {
    height: b.height, hash: b.hash, time: b.time, size: b.size ?? null, txCount: b.tx.length,
    confirmations: tip !== null && tip >= b.height ? tip - b.height + 1 : b.confirmations ?? null,
    previousHash: b.previousblockhash ?? null, nextHash: b.nextblockhash ?? null,
    difficulty: b.difficulty ?? null, txs: b.tx.map(summarizeTx),
  };
}

export async function getTxDetail(txid: string): Promise<TxDetail | null> {
  // cache the compact summary, never the raw tx (large consolidation txs are many MB of JSON)
  return cached(`txd:${txid}`, 10 * 60_000, async () => { const t = await getRpc().getRawTransaction(txid); return t ? toTxDetail(t) : null; });
}
function toTxDetail(t: RpcTx): TxDetail {
  return {
    txid: t.txid, blockHash: t.blockhash ?? null, height: t.height ?? null, time: t.blocktime ?? t.time ?? null,
    confirmations: t.confirmations ?? null, size: t.size ?? null, version: t.version ?? null,
    coinbase: t.vin.some((v) => v.coinbase !== undefined),
    inputs: t.vin.filter((v) => v.coinbase === undefined).map((v) => ({ txid: v.txid ?? null, vout: v.vout ?? null, address: v.address ?? null, value: v.value ?? null })),
    outputs: t.vout.map((o) => ({ n: o.n, value: o.value, address: o.scriptPubKey.addresses?.[0] ?? o.scriptPubKey.address ?? null, type: o.scriptPubKey.type ?? null })),
    shielded: { saplingSpends: t.vShieldedSpend?.length ?? 0, saplingOutputs: t.vShieldedOutput?.length ?? 0, orchardActions: t.orchard?.actions?.length ?? 0, sproutJoinSplits: t.vjoinsplit?.length ?? 0 },
  };
}

export async function getAddressInfo(address: string): Promise<AddressInfo> {
  const v = await cached(`addr:${address}`, 60_000, () => fetchAddressInfo(address));
  if (!v) throw new Error("address lookup failed");
  return v;
}
async function fetchAddressInfo(address: string): Promise<AddressInfo> {
  const rpc = getRpc();
  const [bal, deltas] = await Promise.all([rpc.getAddressBalance(address), rpc.getAddressDeltas(address)]);
  let txs: AddressInfo["txs"] = deltas ? [...deltas].sort((a, b) => b.height - a.height).slice(0, 25).map((d) => ({ txid: d.txid, height: d.height, deltaZec: d.satoshis / 1e8 })) : null;
  if (!deltas) {
    // Zebra: no getaddressdeltas. Use getaddresstxids + getrawtransaction for the 10 most recent (delta not reported).
    const ids = await rpc.getAddressTxids(address);
    if (ids) {
      const recent = ids.slice(-5).reverse(); // 5 most recent: each costs provider compute units
      const heights: (number | null)[] = [];
      for (const id of recent) heights.push(await cached(`txh:${id}`, 24 * 3600_000, async () => { const t = await rpc.getRawTransaction(id); return t ? { h: t.height ?? null } : null; }).then((v) => v?.h ?? null).catch(() => null)); // sequential: gentle on the provider; only the height is kept
      txs = recent.map((txid, i) => ({ txid, height: heights[i], deltaZec: null }));
      txs.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
    }
  }
  return {
    address, indexAvailable: bal !== null || txs !== null,
    balanceZec: bal ? bal.balance / 1e8 : null, receivedZec: bal ? bal.received / 1e8 : null,
    txs,
  };
}

export async function getPoolHistory(range: PoolRange): Promise<{ points: PoolPoint[]; updatedAt: number | null }> {
  return withDb(() => poolsFromDb(range), () => { throw new StorageUnavailable(storageNote() ?? "Database unavailable"); });
}
const poolCache = new Map<PoolRange, { at: number; v: { points: PoolPoint[]; updatedAt: number | null } }>();
async function poolsFromDb(range: PoolRange): Promise<{ points: PoolPoint[]; updatedAt: number | null }> {
  const c = poolCache.get(range);
  if (c && Date.now() - c.at < 5 * 60_000) return c.v; // daily data; 5-min memo per instance
  const v = await poolsQuery(range);
  poolCache.set(range, { at: Date.now(), v });
  return v;
}
async function poolsQuery(range: PoolRange): Promise<{ points: PoolPoint[]; updatedAt: number | null }> {
  await ensureFresh();
  const db = await getDb();
  const since = range === "all" ? "0000-00-00" : new Date(Date.now() - (range === "7d" ? 7 : 30) * 86400_000).toISOString().slice(0, 10);
  const rows = await db.select().from(schema.poolSnapshots).where(gte(schema.poolSnapshots.date, since)).orderBy(schema.poolSnapshots.date);
  return {
    points: rows.map((r) => ({ date: r.date, height: r.height, transparent: r.transparent, sprout: r.sprout, sapling: r.sapling, orchard: r.orchard, lockbox: r.lockbox, ironwood: r.ironwood })),
    updatedAt: rows.reduce<number | null>((m, r) => (m === null || r.takenAt > m ? r.takenAt : m), null),
  };
}
