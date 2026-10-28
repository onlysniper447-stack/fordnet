import { describe, expect, it } from "vitest";
import { dbAvailable, storageNote, withDb } from "../src/lib/dbguard";

describe("withDb circuit breaker", () => {
  it("falls back on a Neon 402 quota error and stays open for the window", async () => {
    let calls = 0;
    const quota = async () => { calls++; throw new Error("NeonDbError: Server error (HTTP status 402): exceeded the quota"); };
    expect(await withDb(quota, () => "fallback")).toBe("fallback");
    expect(dbAvailable()).toBe(false);
    expect(storageNote()).toMatch(/quota/i);
    expect(await withDb(quota, () => "fallback-2")).toBe("fallback-2");
    expect(calls).toBe(1); // second call skipped the DB entirely
  });
});
