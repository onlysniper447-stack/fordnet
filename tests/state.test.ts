import { describe, expect, it } from "vitest";
import { deriveState, DOWN_MS, FRESH_MS, INGEST_INTERVAL_MS } from "../src/lib/state";
import type { Degraded } from "../src/lib/types";

const now = 1_800_000_000_000;
const snap = (ageMs: number, blockAgeSec = 60) => ({ snapshotAt: now - ageMs, lastBlockTime: Math.floor((now - ageMs) / 1000) - blockAgeSec, height: 3_000_000, headers: 3_000_000 });
const fail = (reason: Degraded["reason"]): Degraded => ({ reason, since: now - 60_000, retryAt: now + 20_000, detail: "The operation was aborted due to timeout" });

describe("deriveState", () => {
  it("fresh data is synced even when the last attempt failed (no false red)", () => {
    for (const r of ["unreachable", "rate_limited", "provider_error"] as const) {
      const d = deriveState(snap(3 * 60_000), fail(r), now);
      expect(d.state).toBe("synced"); expect(d.live).toBe(true); expect(d.degraded).toBeNull(); expect(d.providerNote?.reason).toBe(r);
    }
  });
  it("5-min ingest spacing never turns amber on its own", () => {
    expect(INGEST_INTERVAL_MS * 1.5).toBeLessThan(FRESH_MS);
    expect(deriveState({ ...snap(INGEST_INTERVAL_MS + 60_000), lastBlockTime: Math.floor(now / 1000) - 60 }, fail("unreachable"), now).state).toBe("synced");
  });
  it("fresh data with an old last block is lagging, not an error", () => {
    expect(deriveState(snap(30_000, 400), null, now).state).toBe("lagging");
  });
  it("5-15 min old data is delayed (amber) with the provider reason", () => {
    const d = deriveState(snap(FRESH_MS + 1000), fail("rate_limited"), now);
    expect(d.state).toBe("delayed"); expect(d.degraded?.reason).toBe("rate_limited");
    expect(deriveState(snap(DOWN_MS - 1000), fail("unreachable"), now).state).toBe("delayed");
  });
  it("stale data without a recorded failure stays delayed, never red", () => {
    const d = deriveState(snap(DOWN_MS + 60_000), null, now);
    expect(d.state).toBe("delayed"); expect(d.degraded?.reason).toBe("stale");
  });
  it("red only after 15 min without success while attempts fail", () => {
    const d = deriveState(snap(DOWN_MS + 1), fail("unreachable"), now);
    expect(d.state).toBe("unreachable"); expect(d.live).toBe(false);
  });
  it("provider quota exhausted stays amber with the reset time, even when old", () => {
    const d = deriveState(snap(DOWN_MS * 3), { reason: "quota_exhausted", since: now - 3600_000, retryAt: now + 3600_000 }, now);
    expect(d.state).toBe("delayed"); expect(d.degraded?.reason).toBe("quota_exhausted"); expect(d.degraded?.retryAt).toBe(now + 3600_000);
  });
  it("no snapshot at all is unreachable", () => {
    expect(deriveState(null, null, now).state).toBe("unreachable");
  });
});
