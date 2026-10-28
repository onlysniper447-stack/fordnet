import { afterEach, describe, expect, it, vi } from "vitest";
import { endpointsFromEnv, HttpRpcClient, parseHeaders } from "../src/lib/rpc";
import { _reset, usedToday } from "../src/lib/rpc-budget";

afterEach(() => { vi.unstubAllGlobals(); _reset(); });

describe("fallback endpoint", () => {
  it("builds the fallback with its api-key header and own budget pool", () => {
    const eps = endpointsFromEnv("https://primary", { ZCASH_RPC_URL_FALLBACK: "https://zec.nownodes.io", ZCASH_RPC_FALLBACK_API_KEY: "k" });
    expect(eps).toEqual([{ url: "https://primary", pool: "primary" }, { url: "https://zec.nownodes.io", headers: { "api-key": "k" }, pool: "fallback" }]);
    expect(parseHeaders("api-key: a; X-Other: b")).toEqual({ "api-key": "a", "X-Other": "b" });
  });

  it("uses the fallback when the primary is out of CU (402), and skips the locked-out primary afterwards", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push(url);
      if (url === "https://primary") return new Response("Out of CU", { status: 402 });
      expect((init.headers as Record<string, string>)["api-key"]).toBe("k");
      return new Response(JSON.stringify({ result: 123, error: null }), { status: 200 });
    }));
    const c = new HttpRpcClient(endpointsFromEnv("https://primary", { ZCASH_RPC_URL_FALLBACK: "https://fb", ZCASH_RPC_FALLBACK_API_KEY: "k" }));
    expect(await c.getBlockCount()).toBe(123);
    expect(await c.getBlockCount()).toBe(123);
    expect(seen).toEqual(["https://primary", "https://fb", "https://fb"]); // primary not called again until reset
    expect(usedToday("fallback")).toBe(2);
  });

  it("does not retry a rejected key", async () => {
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async () => { n++; return new Response("Unknown API_key", { status: 401 }); }));
    await expect(new HttpRpcClient("https://only").getBlockCount()).rejects.toThrow(/HTTP 401/);
    expect(n).toBe(1);
  });
});
