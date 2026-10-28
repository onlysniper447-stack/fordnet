/** Per-visitor lookup limiter (edge-safe, in-memory per instance). Protects the node provider's daily quota. */
export const PER_MINUTE = Number(process.env.LOOKUP_LIMIT_PER_MIN ?? 20);
export const PER_DAY = Number(process.env.LOOKUP_LIMIT_PER_DAY ?? 200);

interface Bucket { minStart: number; min: number; day: string; dayCount: number }
export class VisitorLimiter {
  private m = new Map<string, Bucket>();
  constructor(private perMin = PER_MINUTE, private perDay = PER_DAY, private maxKeys = 20_000) {}
  /** Counts one lookup. Returns null when allowed, else seconds until the visitor may retry. */
  hit(key: string, now = Date.now()): { retryAfterSec: number; scope: "minute" | "day" } | null {
    const day = new Date(now).toISOString().slice(0, 10);
    let b = this.m.get(key);
    if (!b || b.day !== day) b = { minStart: now, min: 0, day, dayCount: 0 };
    if (now - b.minStart >= 60_000) { b.minStart = now; b.min = 0; }
    if (b.dayCount >= this.perDay) {
      const d = new Date(now); const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
      this.set(key, b); return { retryAfterSec: Math.ceil((reset - now) / 1000), scope: "day" };
    }
    if (b.min >= this.perMin) { this.set(key, b); return { retryAfterSec: Math.max(1, Math.ceil((b.minStart + 60_000 - now) / 1000)), scope: "minute" }; }
    b.min++; b.dayCount++; this.set(key, b);
    return null;
  }
  private set(k: string, b: Bucket) {
    this.m.set(k, b);
    if (this.m.size > this.maxKeys) this.m.delete(this.m.keys().next().value as string); // bounded memory
  }
}

export function clientIp(h: Headers): string {
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
/** Link prefetches are not views; don't spend the visitor's budget on them. */
export const isPrefetch = (h: Headers) => h.get("next-router-prefetch") === "1" || h.get("purpose") === "prefetch" || h.get("sec-purpose")?.includes("prefetch") === true;
