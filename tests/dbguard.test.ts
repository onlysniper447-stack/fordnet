import { describe, expect, it } from "vitest";
import { dbAvailable, storageNote, withDb } from "../src/lib/dbguard";

describe("withDb circuit breaker", () => {
  it("does not trip on non-database errors", async () => {
    expect(await withDb(async () => { throw new Error("Failed query: insert ... params: 402,503"); }, () => "fb")).toBe("fb");
    expect(dbAvailable()).toBe(true);
  });
  it("falls back on a Neon 402 quota error and stays open for the window", async () => {
    let calls = 0;
    const quota = async () => { calls++; const e = new Error("Server error (HTTP status 402): exceeded the quota"); e.name = "NeonDbError"; throw e; };
    expect(await withDb(quota, () => "fallback")).toBe("fallback");
    expect(dbAvailable()).toBe(false);
    expect(storageNote()).toMatch(/quota/i);
    expect(await withDb(quota, () => "fallback-2")).toBe("fallback-2");
    expect(calls).toBe(1); // second call skipped the DB entirely
  });
});
