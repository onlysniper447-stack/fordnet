/**
 * App-wide daily cap on node calls (GetBlock free plan: 50,000 CU/day). Counted in memory per instance and
 * flushed to Postgres at most once a minute (one upsert), so every instance sees an approximate shared total.
 * Lookups (block/tx/address pages) stop at LOOKUP_SHARE of the budget, leaving headroom for ingest/status.
 */
export const DAILY_CALL_BUDGET = Number(process.env.RPC_DAILY_CALL_BUDGET ?? 2000);
export const LOOKUP_SHARE = Number(process.env.RPC_LOOKUP_SHARE ?? 0.6);

const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const state = { day: today(), shared: 0, unflushed: 0 };

function roll(now = Date.now()) { const d = today(now); if (d !== state.day) { state.day = d; state.shared = 0; state.unflushed = 0; } }
export function countCall() { roll(); state.unflushed++; }
export function usedToday() { roll(); return state.shared + state.unflushed; }
export function lookupBudgetOk() { return usedToday() < DAILY_CALL_BUDGET * LOOKUP_SHARE; }
export function totalBudgetOk() { return usedToday() < DAILY_CALL_BUDGET; }

export class BudgetExhausted extends Error {
  constructor(public scope: "lookup" | "total") { super(scope === "lookup" ? "Daily lookup budget for the node provider is used up" : "Daily node-call budget is used up"); }
}

/** Persist this instance's unflushed calls and learn the shared total. `upsert` adds n and returns the new total. */
export async function flushUsage(upsert: (day: string, n: number) => Promise<number>) {
  roll();
  const n = state.unflushed; state.unflushed = 0;
  try { state.shared = await upsert(state.day, n); } catch { state.unflushed += n; }
}
/** test helper */
export function _reset(shared = 0) { state.day = today(); state.shared = shared; state.unflushed = 0; }
