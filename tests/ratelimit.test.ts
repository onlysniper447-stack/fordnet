import { describe, expect, it } from "vitest";
import { checkRateLimit, MemoryCounterStore, DAILY_LIMIT } from "../src/lib/ratelimit";

describe("checkRateLimit", async () => {
  const noon = Date.UTC(2026, 9, 27, 12, 0, 0);
  it("allows up to 200/day then 429s with Retry-After to UTC midnight", async () => {
    const s = new MemoryCounterStore();
    for (let i = 1; i <= DAILY_LIMIT; i++) {
      const r = await checkRateLimit(s, "k", noon);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(DAILY_LIMIT - i);
    }
    const over = await checkRateLimit(s, "k", noon);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
    expect(over.retryAfterSec).toBe(12 * 3600);
  });
  it("isolates keys", async () => {
    const s = new MemoryCounterStore();
    for (let i = 0; i < 3; i++) await checkRateLimit(s, "a", noon, 3);
    expect((await checkRateLimit(s, "a", noon, 3)).allowed).toBe(false);
    expect((await checkRateLimit(s, "b", noon, 3)).allowed).toBe(true);
  });
  it("resets on the next UTC day", async () => {
    const s = new MemoryCounterStore();
    await checkRateLimit(s, "a", noon, 1);
    expect((await checkRateLimit(s, "a", noon, 1)).allowed).toBe(false);
    expect((await checkRateLimit(s, "a", noon + 12 * 3600_000, 1)).allowed).toBe(true);
  });
  it("retry-after is at least 1s just before midnight", async () => {
    const s = new MemoryCounterStore();
    const t = Date.UTC(2026, 9, 27, 23, 59, 59, 900);
    await checkRateLimit(s, "a", t, 1);
    expect((await checkRateLimit(s, "a", t, 1)).retryAfterSec).toBe(1);
  });
});
