/**
 * Circuit breaker for Postgres. When Neon refuses (e.g. HTTP 402 quota exceeded) or is unreachable,
 * callers fall back to live RPC / memory for a short window instead of failing every request.
 */
let downUntil = 0;
let reason: string | null = null;

export const dbAvailable = () => Date.now() >= downUntil;
/** Human-readable storage problem, or null when the database is fine. */
export const storageNote = () => (dbAvailable() ? null : reason);

function markDown(e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  const cause = err.cause instanceof Error ? err.cause : null;
  const neon = [err, cause].find((x) => x && /NeonDbError/.test(x.name)) ?? null;
  const text = `${neon?.message ?? cause?.message ?? err.message}`.slice(0, 200);
  if (neon && /HTTP status 402|quota/i.test(neon.message)) { reason = "Database quota exceeded — serving live node data; history and caching paused"; downUntil = Date.now() + 60_000; }
  else if (neon || /DATABASE_URL|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(text)) { reason = "Database unavailable — serving live node data; history and caching paused"; downUntil = Date.now() + 15_000; }
  // anything else (e.g. a constraint error) is a one-off: fall back for this call only, keep the DB in use
  console.warn(`[db] ${text.replace(/postgres(ql)?:\/\/\S+/g, "[url]")}`);
}

export async function withDb<T>(fn: () => Promise<T>, fallback: (e: unknown) => T | Promise<T>): Promise<T> {
  if (!dbAvailable()) return fallback(new Error(reason ?? "database unavailable"));
  try { return await fn(); } catch (e) { markDown(e); return fallback(e); }
}

export class StorageUnavailable extends Error {}
