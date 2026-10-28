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
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/402|quota/i.test(m)) { reason = "Database quota exceeded — serving live node data; history and caching paused"; downUntil = Date.now() + 60_000; }
  else if (/Neon|DATABASE_URL|fetch failed|ECONN|ETIMEDOUT|socket|5\d\d/i.test(m)) { reason = "Database unavailable — serving live node data; history and caching paused"; downUntil = Date.now() + 15_000; }
  console.warn(`[db] ${m.replace(/postgres(ql)?:\/\/\S+/g, "[url]").slice(0, 200)}`);
}

export async function withDb<T>(fn: () => Promise<T>, fallback: (e: unknown) => T | Promise<T>): Promise<T> {
  if (!dbAvailable()) return fallback(new Error(reason ?? "database unavailable"));
  try { return await fn(); } catch (e) { markDown(e); return fallback(e); }
}

export class StorageUnavailable extends Error {}
