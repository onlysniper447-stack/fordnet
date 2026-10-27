// MOCKED Zcash RPC data. Deterministic, clearly synthetic. Used only when no node is configured.
import { createHash } from "node:crypto";
import type { RpcBlock, RpcBlockchainInfo, RpcMiningInfo, RpcTx, RpcValuePool, RpcAddressBalance, RpcAddressDelta } from "./types";

const BASE_HEIGHT = 3_100_000;
const BASE_TIME = Date.UTC(2025, 9, 1) / 1000; // arbitrary anchor
const SPACING = 75;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const seed = (s: string) => parseInt(sha(s).slice(0, 8), 16);

export function mockTipHeight(nowMs = Date.now()): number {
  return BASE_HEIGHT + Math.floor((nowMs / 1000 - BASE_TIME) / SPACING);
}
export function mockBlockHash(h: number): string {
  return ("0000000" + h.toString(16).padStart(9, "0") + sha(`blk${h}`)).slice(0, 64);
}
export function mockHeightFromHash(hash: string): number | null {
  if (!hash.startsWith("0000000")) return null;
  const h = parseInt(hash.slice(7, 16), 16);
  return mockBlockHash(h) === hash.toLowerCase() ? h : null;
}
function mockTxid(h: number, i: number): string {
  return ("f0" + h.toString(16).padStart(8, "0") + i.toString(16).padStart(4, "0") + sha(`tx${h}:${i}`)).slice(0, 64);
}
function parseTxid(txid: string): { h: number; i: number } | null {
  if (!txid.startsWith("f0")) return null;
  const h = parseInt(txid.slice(2, 10), 16);
  const i = parseInt(txid.slice(10, 14), 16);
  return mockTxid(h, i) === txid.toLowerCase() ? { h, i } : null;
}
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function mockAddress(n: number): string {
  const s = sha(`addr${n}`);
  let out = n % 5 === 0 ? "t3" : "t1";
  for (let k = 0; out.length < 35; k++) out += B58[parseInt(s.slice((k * 2) % 62, (k * 2) % 62 + 2), 16) % 58];
  return out;
}
function poolsAt(h: number): RpcValuePool[] {
  const d = h - BASE_HEIGHT;
  const wobble = (k: string, a: number) => ((seed(`${k}${Math.floor(h / 1152)}`) % 1000) / 1000 - 0.5) * a;
  const v = {
    transparent: 11_200_000 + d * 0.9 + wobble("t", 4000),
    sprout: 25_400 - d * 0.0005,
    sapling: 1_120_000 - d * 0.12 + wobble("s", 1500),
    orchard: 4_150_000 + d * 0.6 + wobble("o", 3000),
    lockbox: 310_000 + d * 0.375,
  };
  return Object.entries(v).map(([id, val]) => {
    const chainValue = Math.round(val * 1e8) / 1e8;
    return { id, monitored: true, chainValue, chainValueZat: Math.round(chainValue * 1e8) };
  });
}
function txAt(h: number, i: number, time: number): RpcTx {
  const s = seed(`t${h}:${i}`);
  const coinbase = i === 0;
  const nOut = coinbase ? 2 : 1 + (s % 3);
  const shielded = !coinbase && s % 3 !== 0;
  return {
    txid: mockTxid(h, i),
    version: 5,
    size: 250 + (s % 4000),
    locktime: 0,
    expiryheight: h + 40,
    vin: coinbase ? [{ coinbase: "03" + h.toString(16) }] : [{ txid: mockTxid(h - 1 - (s % 50), 1 + (s % 3)), vout: s % 2, address: mockAddress(s % 40), value: ((s % 50000) + 1000) / 1e4 }],
    vout: Array.from({ length: nOut }, (_, n) => ({
      value: coinbase ? (n === 0 ? 1.25 : 0.15625) : Math.round((((s >> n) % 40000) + 500) / 1e4 * 1e8) / 1e8,
      n,
      scriptPubKey: { type: n % 2 && !coinbase ? "scripthash" : "pubkeyhash", addresses: [mockAddress((s + n * 7) % 40)] },
    })),
    vShieldedSpend: shielded ? Array.from({ length: s % 2 }, () => ({})) : [],
    vShieldedOutput: shielded ? Array.from({ length: 1 + (s % 2) }, () => ({})) : [],
    vjoinsplit: [],
    orchard: { actions: shielded && s % 2 ? [{}, {}] : [] },
    blockhash: mockBlockHash(h),
    height: h,
    time,
    blocktime: time,
  };
}
export function mockBlock(h: number, nowMs = Date.now()): RpcBlock | null {
  const tip = mockTipHeight(nowMs);
  if (h < 0 || h > tip) return null;
  const time = BASE_TIME + (h - BASE_HEIGHT) * SPACING + (seed(`j${h}`) % 20);
  const n = 1 + (seed(`n${h}`) % 14);
  const tx = Array.from({ length: n }, (_, i) => txAt(h, i, time));
  return {
    hash: mockBlockHash(h), height: h, time,
    size: tx.reduce((a, t) => a + (t.size ?? 0), 200),
    confirmations: tip - h + 1,
    previousblockhash: h > 0 ? mockBlockHash(h - 1) : undefined,
    nextblockhash: h < tip ? mockBlockHash(h + 1) : undefined,
    difficulty: 70_000_000 + (seed(`d${Math.floor(h / 100)}`) % 9_000_000),
    tx, valuePools: poolsAt(h),
  };
}
export function mockBlockchainInfo(nowMs = Date.now()): RpcBlockchainInfo {
  const h = mockTipHeight(nowMs);
  const b = mockBlock(h, nowMs);
  return { chain: "main", blocks: h, headers: h, bestblockhash: mockBlockHash(h), difficulty: b?.difficulty, verificationprogress: 0.99999, valuePools: poolsAt(h) };
}
export function mockMiningInfo(nowMs = Date.now()): RpcMiningInfo {
  const h = mockTipHeight(nowMs);
  return { networksolps: 11_000_000_000 + (seed(`hr${Math.floor(h / 10)}`) % 1_500_000_000), difficulty: mockBlock(h, nowMs)?.difficulty };
}
export function mockTx(txid: string, nowMs = Date.now()): RpcTx | null {
  const p = parseTxid(txid);
  if (!p) return null;
  const b = mockBlock(p.h, nowMs);
  const t = b?.tx[p.i];
  return t ? { ...t, confirmations: b?.confirmations } : null;
}
export function mockAddressBalance(addr: string): RpcAddressBalance {
  const s = seed(addr);
  return { balance: s % 5_000_000_000, received: (s % 5_000_000_000) + (s % 900_000_000) };
}
export function mockAddressDeltas(addr: string, nowMs = Date.now()): RpcAddressDelta[] {
  const s = seed(addr);
  const tip = mockTipHeight(nowMs);
  return Array.from({ length: 6 }, (_, k) => {
    const h = tip - 3 - k * (40 + (s % 30));
    return { txid: mockTxid(h, 1), height: h, satoshis: (k % 2 ? -1 : 1) * ((s >> k) % 300_000_000) };
  });
}
