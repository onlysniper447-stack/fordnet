export const DAILY_LIMIT = 200;

export interface CounterStore {
  /** Atomically increment and return the new count for bucket/day. */
  increment(bucket: string, day: string): number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // unix ms (next UTC midnight)
  retryAfterSec: number;
}

export class MemoryCounterStore implements CounterStore {
  private m = new Map<string, number>();
  increment(bucket: string, day: string): number {
    const k = `${bucket}|${day}`;
    const n = (this.m.get(k) ?? 0) + 1;
    this.m.set(k, n);
    return n;
  }
}

/** Fixed window per UTC day. */
export function checkRateLimit(store: CounterStore, bucket: string, nowMs = Date.now(), limit = DAILY_LIMIT): RateLimitResult {
  const d = new Date(nowMs);
  const day = d.toISOString().slice(0, 10);
  const resetAt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  const count = store.increment(bucket, day);
  const allowed = count <= limit;
  return { allowed, limit, remaining: Math.max(0, limit - count), resetAt, retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((resetAt - nowMs) / 1000)) };
}
