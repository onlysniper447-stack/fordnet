import { describe, expect, it } from "vitest";
import { VisitorLimiter, clientIp, isPrefetch } from "../src/lib/visitor-limit";
import { _reset, countCall, DAILY_CALL_BUDGET, LOOKUP_SHARE, lookupBudgetOk, totalBudgetOk, flushUsage } from "../src/lib/rpc-budget";
import { axisFor } from "../src/lib/axis";

describe("VisitorLimiter", () => {
  it("allows 20/min then 429 with Retry-After, resets after a minute", () => {
    const l = new VisitorLimiter(20, 200); const t = 1_800_000_000_000;
    for (let i = 0; i < 20; i++) expect(l.hit("1.2.3.4", t + i)).toBeNull();
    const r = l.hit("1.2.3.4", t + 30_000); expect(r?.scope).toBe("minute"); expect(r?.retryAfterSec).toBe(30);
    expect(l.hit("5.6.7.8", t)).toBeNull(); // other visitors unaffected
    expect(l.hit("1.2.3.4", t + 60_001)).toBeNull();
  });
  it("caps 200/day", () => {
    const l = new VisitorLimiter(1000, 200); const t = Date.UTC(2026, 9, 28, 12);
    for (let i = 0; i < 200; i++) expect(l.hit("ip", t + i)).toBeNull();
    const r = l.hit("ip", t + 500); expect(r?.scope).toBe("day"); expect(r?.retryAfterSec).toBe(12 * 3600);
  });
  it("reads the client ip and spots prefetches", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-real-ip": "8.8.8.8", "x-forwarded-for": "9.9.9.9" }))).toBe("8.8.8.8");
    expect(isPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetch(new Headers())).toBe(false);
  });
});

describe("daily node-call budget", () => {
  it("stops lookups at their share, everything at the total", async () => {
    _reset(Math.ceil(DAILY_CALL_BUDGET * LOOKUP_SHARE) - 1);
    expect(lookupBudgetOk()).toBe(true); countCall(); expect(lookupBudgetOk()).toBe(false); expect(totalBudgetOk()).toBe(true);
    await flushUsage(async () => DAILY_CALL_BUDGET); expect(totalBudgetOk()).toBe(false);
    _reset();
  });
});

describe("pool axis", () => {
  it("never repeats tick labels for a flat series", () => {
    const { ticks, domain } = axisFor([419942.52]);
    const labels = ticks.map((t) => new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 5 }).format(t));
    expect(new Set(labels).size).toBe(labels.length); expect(domain[0]).toBeLessThan(419942.52); expect(domain[1]).toBeGreaterThan(419942.52);
  });
});
