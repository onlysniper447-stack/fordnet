import { desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getRpc } from "./rpc";
import { ensureFresh, latestSnapshot, rpcHealth, syncState } from "./ingest";
import type { AddressInfo, BlockDetail, BlockSummary, NetworkStatus, PoolPoint, PoolRange, RpcBlock, RpcTx, TxDetail, TxSummary } from "./types";

const EMPTY_POOLS = { transparent: null, sprout: null, sapling: null, orchard: null, lockbox: null, ironwood: null };

const FRESH_MS = 3 * 60_000; // snapshot older than this (after a refresh attempt) => degraded

let statusCache: { at: number; v: NetworkStatus } | null = null;
/** Served from the DB snapshot written by ingest; no per-request RPC. */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (statusCache && Date.now() - statusCache.at < 15_000) return statusCache.v;
  const v = await buildStatus();
  statusCache = { at: Date.now(), v };
  return v;
}
async function buildStatus(): Promise<NetworkStatus> {
  await ensureFresh();
  const [snap, health] = await Promise.all([latestSnapshot(), rpcHealth().catch(() => null)]);
  if (!snap || snap.snapshotAt === null) {
    return { state: health?.reason ?? "unreachable", live: false, mocked: getRpc().mocked, chain: null, height: null, headers: null, bestBlockHash: null, hashrateSolPerSec: null, difficulty: null, lastBlockTime: null, lastBlockTxCount: null, verificationProgress: null, pools: EMPTY_POOLS, snapshotAt: null, degraded: health ?? { reason: "unreachable", since: null, retryAt: null } };
  }
  if (Date.now() - snap.snapshotAt < FRESH_MS) {
    return { ...snap, state: syncState(snap.lastBlockTime, snap.height, snap.headers), live: true, degraded: null };
  }
  const d = health ?? { reason: "unreachable" as const, since: snap.snapshotAt, retryAt: null };
  return { ...snap, state: d.reason, live: false, degraded: d };
}

/** Read-through cache in Postgres so repeat lookups don't hit the RPC provider. Serves stale on failure. */
async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T | null>): Promise<T | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.rpcCache).where(eq(schema.rpcCache.key, key)).limit(1);
  if (row && Date.now() - row.fetchedAt < ttlMs) return JSON.parse(row.value) as T;
  try {
    const v = await fetcher();
    if (v !== null) {
      const value = JSON.stringify(v); const fetchedAt = Date.now();
      await db.insert(schema.rpcCache).values({ key, value, fetchedAt }).onConflictDoUpdate({ target: schema.rpcCache.key, set: { value, fetchedAt } });
    }
    return v;
  } catch (e) {
    if (row) return JSON.parse(row.value) as T;
    throw e;
  }
}

export async function getRecentBlocks(limit: number): Promise<BlockSummary[]> {
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
  const db = await getDb();
  const isHeight = /^\d+$/.test(id);
  const [row] = await db.select().from(schema.blocks).where(isHeight ? eq(schema.blocks.height, Number(id)) : eq(schema.blocks.hash, id)).limit(1);
  const b: RpcBlock | null = row ? (JSON.parse(row.raw) as RpcBlock) : await cached(`block:${id}`, 10 * 60_000, () => getRpc().getBlock(id));
  if (!b) return null;
  const tip = (await latestSnapshot())?.height ?? null;
  return {
    height: b.height, hash: b.hash, time: b.time, size: b.size ?? null, txCount: b.tx.length,
    confirmations: tip !== null && tip >= b.height ? tip - b.height + 1 : b.confirmations ?? null,
    previousHash: b.previousblockhash ?? null, nextHash: b.nextblockhash ?? null,
    difficulty: b.difficulty ?? null, txs: b.tx.map(summarizeTx),
  };
}

export async function getTxDetail(txid: string): Promise<TxDetail | null> {
  const t = await cached(`tx:${txid}`, 10 * 60_000, () => getRpc().getRawTransaction(txid));
  if (!t) return null;
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
      const recent = ids.slice(-10).reverse();
      const raws: (RpcTx | null)[] = [];
      for (const id of recent) raws.push(await cached(`tx:${id}`, 10 * 60_000, () => rpc.getRawTransaction(id)).catch(() => null)); // sequential: gentle on the provider
      txs = recent.map((txid, i) => ({ txid, height: raws[i]?.height ?? null, deltaZec: null }));
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
  await ensureFresh();
  const db = await getDb();
  const since = range === "all" ? "0000-00-00" : new Date(Date.now() - (range === "7d" ? 7 : 30) * 86400_000).toISOString().slice(0, 10);
  const rows = await db.select().from(schema.poolSnapshots).where(gte(schema.poolSnapshots.date, since)).orderBy(schema.poolSnapshots.date);
  return {
    points: rows.map((r) => ({ date: r.date, height: r.height, transparent: r.transparent, sprout: r.sprout, sapling: r.sapling, orchard: r.orchard, lockbox: r.lockbox, ironwood: r.ironwood })),
    updatedAt: rows.reduce<number | null>((m, r) => (m === null || r.takenAt > m ? r.takenAt : m), null),
  };
}
