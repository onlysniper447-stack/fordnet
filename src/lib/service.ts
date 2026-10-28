import { desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getRpc } from "./rpc";
import { ensureFresh, latestSnapshot, syncState } from "./ingest";
import { poolsFrom } from "./pools";
import type { AddressInfo, BlockDetail, BlockSummary, NetworkStatus, PoolPoint, PoolRange, RpcBlock, RpcTx, TxDetail, TxSummary } from "./types";

const EMPTY_POOLS = { transparent: null, sprout: null, sapling: null, orchard: null, lockbox: null, ironwood: null };

let statusCache: { at: number; v: NetworkStatus } | null = null;
export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (statusCache && Date.now() - statusCache.at < 15_000) return statusCache.v;
  const v = await fetchNetworkStatus();
  if (v.live) statusCache = { at: Date.now(), v };
  return v;
}
async function fetchNetworkStatus(): Promise<NetworkStatus> {
  const rpc = getRpc();
  try {
    const [info, solps] = await Promise.all([rpc.getBlockchainInfo(), rpc.getNetworkSolPs()]);
    const tip = await rpc.getBlock(String(info.blocks), 1);
    void ensureFresh();
    return {
      state: syncState(tip?.time ?? null, info.blocks, info.headers ?? null), live: true, mocked: rpc.mocked,
      chain: info.chain, height: info.blocks, headers: info.headers ?? null, bestBlockHash: info.bestblockhash,
      hashrateSolPerSec: solps, difficulty: info.difficulty ?? null, lastBlockTime: tip?.time ?? null,
      lastBlockTxCount: tip?.tx.length ?? null, verificationProgress: info.verificationprogress ?? null,
      pools: poolsFrom(info.valuePools), snapshotAt: Date.now(),
    };
  } catch {
    const snap = latestSnapshot();
    if (snap) return { ...snap, state: "unreachable", live: false };
    return { state: "unreachable", live: false, mocked: rpc.mocked, chain: null, height: null, headers: null, bestBlockHash: null, hashrateSolPerSec: null, difficulty: null, lastBlockTime: null, lastBlockTxCount: null, verificationProgress: null, pools: EMPTY_POOLS, snapshotAt: null };
  }
}

export async function getRecentBlocks(limit: number): Promise<BlockSummary[]> {
  await ensureFresh();
  return getDb().select({ height: schema.blocks.height, hash: schema.blocks.hash, time: schema.blocks.time, size: schema.blocks.size, txCount: schema.blocks.txCount })
    .from(schema.blocks).orderBy(desc(schema.blocks.height)).limit(limit).all();
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
  const db = getDb();
  const isHeight = /^\d+$/.test(id);
  const row = db.select().from(schema.blocks).where(isHeight ? eq(schema.blocks.height, Number(id)) : eq(schema.blocks.hash, id)).get();
  let b: RpcBlock | null = row ? (JSON.parse(row.raw) as RpcBlock) : null;
  try { b = (await getRpc().getBlock(id)) ?? (row ? b : null); } catch { /* use cached row */ }
  if (!b) return null;
  return {
    height: b.height, hash: b.hash, time: b.time, size: b.size ?? null, txCount: b.tx.length,
    confirmations: b.confirmations ?? null, previousHash: b.previousblockhash ?? null, nextHash: b.nextblockhash ?? null,
    difficulty: b.difficulty ?? null, txs: b.tx.map(summarizeTx),
  };
}

export async function getTxDetail(txid: string): Promise<TxDetail | null> {
  const t = await getRpc().getRawTransaction(txid);
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
  const rpc = getRpc();
  const [bal, deltas] = await Promise.all([rpc.getAddressBalance(address), rpc.getAddressDeltas(address)]);
  let txs: AddressInfo["txs"] = deltas ? [...deltas].sort((a, b) => b.height - a.height).slice(0, 25).map((d) => ({ txid: d.txid, height: d.height, deltaZec: d.satoshis / 1e8 })) : null;
  if (!deltas) {
    // Zebra: no getaddressdeltas. Use getaddresstxids + getrawtransaction for the 10 most recent (delta not reported).
    const ids = await rpc.getAddressTxids(address);
    if (ids) {
      const recent = ids.slice(-10).reverse();
      const raws = await Promise.all(recent.map((id) => rpc.getRawTransaction(id).catch(() => null)));
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
  const db = getDb();
  const since = range === "all" ? "0000-00-00" : new Date(Date.now() - (range === "7d" ? 7 : 30) * 86400_000).toISOString().slice(0, 10);
  const rows = db.select().from(schema.poolSnapshots).where(gte(schema.poolSnapshots.date, since)).orderBy(schema.poolSnapshots.date).all();
  return {
    points: rows.map((r) => ({ date: r.date, height: r.height, transparent: r.transparent, sprout: r.sprout, sapling: r.sapling, orchard: r.orchard, lockbox: r.lockbox, ironwood: r.ironwood })),
    updatedAt: rows.reduce<number | null>((m, r) => (m === null || r.takenAt > m ? r.takenAt : m), null),
  };
}
