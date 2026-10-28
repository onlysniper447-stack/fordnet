/**
 * Daily caps on node calls, one pool per endpoint (GetBlock free: 50,000 CU/day; NOWNodes Start: 100k requests/month).
 * Counted in memory per instance and flushed to Postgres at most once a minute (one upsert per pool), so every
 * instance sees an approximate shared total. Lookups stop at LOOKUP_SHARE of the combined budget.
 */
export type Pool = "primary" | "fallback";
export const DAILY_CALL_BUDGET = Number(process.env.RPC_DAILY_CALL_BUDGET ?? 2000);
export const FALLBACK_DAILY_BUDGET = Number(process.env.RPC_FALLBACK_DAILY_BUDGET ?? 3000);
export const LOOKUP_SHARE = Number(process.env.RPC_LOOKUP_SHARE ?? 0.6);
const LIMIT: Record<Pool, number> = { primary: DAILY_CALL_BUDGET, fallback: FALLBACK_DAILY_BUDGET };

const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const fresh = () => ({ shared: 0, unflushed: 0 });
const state = { day: today(), pools: { primary: fresh(), fallback: fresh() } as Record<Pool, { shared: number; unflushed: number }> };

function roll(now = Date.now()) { const d = today(now); if (d !== state.day) { state.day = d; state.pools = { primary: fresh(), fallback: fresh() }; } }
export function countCall(pool: Pool = "primary") { roll(); state.pools[pool].unflushed++; }
export function usedToday(pool: Pool = "primary") { roll(); const p = state.pools[pool]; return p.shared + p.unflushed; }
export function poolOk(pool: Pool) { return usedToday(pool) < LIMIT[pool]; }
/** Lookups may use LOOKUP_SHARE of each pool; allowed while any configured pool has room. */
export function lookupBudgetOk(hasFallback = Boolean(process.env.ZCASH_RPC_URL_FALLBACK)) {
  return usedToday("primary") < DAILY_CALL_BUDGET * LOOKUP_SHARE || (hasFallback && usedToday("fallback") < FALLBACK_DAILY_BUDGET * LOOKUP_SHARE);
}
export function totalBudgetOk() { return poolOk("primary"); }

export class BudgetExhausted extends Error {
  constructor(public scope: "lookup" | "total") { super(scope === "lookup" ? "Daily lookup budget for the node provider is used up" : "Daily node-call budget is used up"); }
}

/** Persist unflushed calls per pool and learn the shared totals. `upsert(key, n)` adds n and returns the new total. */
export async function flushUsage(upsert: (key: string, n: number) => Promise<number>) {
  roll();
  for (const pool of ["primary", "fallback"] as const) {
    const p = state.pools[pool]; const n = p.unflushed;
    if (n === 0 && p.shared > 0) continue;
    p.unflushed = 0;
    try { p.shared = await upsert(`rpcCalls${pool === "fallback" ? "Fallback" : ""}:${state.day}`, n); } catch { p.unflushed += n; }
  }
}
/** test helper */
export function _reset(shared = 0, pool: Pool = "primary") { state.day = today(); state.pools = { primary: fresh(), fallback: fresh() }; state.pools[pool].shared = shared; }
