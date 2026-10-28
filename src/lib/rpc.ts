import type { RpcBlock, RpcBlockchainInfo, RpcMiningInfo, RpcTx, RpcAddressBalance, RpcAddressDelta } from "./types";
import * as mock from "./mock";

export class RpcError extends Error {
  constructor(message: string, public code: number | null = null) {
    super(message);
  }
}

/** Provider refused because of rate limits / quota (HTTP 429) or overload (HTTP 503). Never retried immediately. */
export class RpcRateLimited extends Error {
  constructor(public status: number, public retryAfterSec: number | null) {
    super(`RPC provider returned HTTP ${status}`);
  }
}

/** Single interface shared by the live and the MOCKED client. */
export interface ZcashRpc {
  readonly mocked: boolean;
  getBlockchainInfo(): Promise<RpcBlockchainInfo>;
  getBlockHash(height: number): Promise<string>;
  getBlockCount(): Promise<number>;
  getBestBlockHash(): Promise<string>;
  getBlock(hashOrHeight: string, verbosity?: 1 | 2): Promise<RpcBlock | null>;
  getAddressTxids(addr: string): Promise<string[] | null>;
  getMiningInfo(): Promise<RpcMiningInfo>;
  getNetworkSolPs(): Promise<number | null>;
  getRawTransaction(txid: string): Promise<RpcTx | null>;
  getAddressBalance(addr: string): Promise<RpcAddressBalance | null>;
  getAddressDeltas(addr: string): Promise<RpcAddressDelta[] | null>;
}

const TIMEOUT_MS = Number(process.env.ZCASH_RPC_TIMEOUT_MS ?? 8000); // shared tiers often take 3-6s
const NOT_FOUND_CODES = new Set([-5, -8]);

export class HttpRpcClient implements ZcashRpc {
  readonly mocked = false;
  /** urls[0] is primary; later entries (ZCASH_RPC_URL_FALLBACK) are tried automatically on transport/provider failure. */
  private urls: string[];
  constructor(url: string | string[], private user?: string, private pass?: string) { this.urls = Array.isArray(url) ? url : [url]; }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    let lastErr: unknown;
    for (const url of this.urls) {
      try { return await this.callOne<T>(url, method, params); }
      catch (e) {
        if (e instanceof RpcError && e.code !== null) throw e; // a real RPC answer (e.g. not found): same on any node
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new RpcError(String(lastErr));
  }

  private async callOne<T>(url: string, method: string, params: unknown[]): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.once<T>(url, method, params);
      } catch (e) {
        if (e instanceof RpcError && e.code !== null) throw e; // node answered with an RPC error
        if (e instanceof RpcRateLimited && e.status === 429) throw e; // rate-limited: back off, don't hammer
        lastErr = e;
        if (attempt === 0 && e instanceof RpcRateLimited) await new Promise((r) => setTimeout(r, 750)); // 503: brief pause, one retry
      }
    }
    throw lastErr instanceof Error ? lastErr : new RpcError(String(lastErr));
  }

  private async once<T>(url: string, method: string, params: unknown[]): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.user || this.pass) headers.authorization = "Basic " + Buffer.from(`${this.user ?? ""}:${this.pass ?? ""}`).toString("base64");
    const res = await fetch(url, {
      method: "POST", headers, cache: "no-store",
      body: JSON.stringify({ jsonrpc: "1.0", id: "fordnet", method, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 429 || res.status === 503) {
      const ra = Number(res.headers.get("retry-after"));
      throw new RpcRateLimited(res.status, Number.isFinite(ra) && ra > 0 ? ra : null);
    }
    const text = await res.text();
    let json: { result?: T; error?: { code: number; message: string } | null };
    try { json = JSON.parse(text); } catch { throw new RpcError(`RPC ${method}: HTTP ${res.status}`); }
    if (json.error) throw new RpcError(json.error.message, json.error.code);
    return json.result as T;
  }

  private async nullOnNotFound<T>(p: Promise<T>): Promise<T | null> {
    try { return await p; } catch (e) {
      if (e instanceof RpcError && e.code !== null && NOT_FOUND_CODES.has(e.code)) return null;
      throw e;
    }
  }
  getBlockchainInfo() { return this.call<RpcBlockchainInfo>("getblockchaininfo"); }
  getBlockHash(h: number) { return this.call<string>("getblockhash", [h]); }
  getBlockCount() { return this.call<number>("getblockcount"); }
  getBestBlockHash() { return this.call<string>("getbestblockhash"); }
  async getBlock(id: string, verbosity: 1 | 2 = 2) {
    const b = await this.nullOnNotFound(this.call<RpcBlock>("getblock", [id, verbosity]));
    if (b && verbosity === 2) for (const t of b.tx as (RpcTx & { hex?: string })[]) delete t.hex; // drop raw hex: big, not displayed
    return b;
  }
  getMiningInfo() { return this.call<RpcMiningInfo>("getmininginfo"); }
  async getNetworkSolPs() { try { return await this.call<number>("getnetworksolps"); } catch (e) { if (e instanceof RpcRateLimited && e.status === 429) throw e; return null; } }
  getRawTransaction(txid: string) { return this.nullOnNotFound(this.call<RpcTx>("getrawtransaction", [txid, 1])); }
  // Address index RPCs need zcashd -insightexplorer / -lightwalletd; null => "not reported".
  async getAddressBalance(a: string) { try { return await this.call<RpcAddressBalance>("getaddressbalance", [{ addresses: [a] }]); } catch (e) { if (e instanceof RpcRateLimited) throw e; return null; } }
  async getAddressTxids(a: string) { try { return await this.call<string[]>("getaddresstxids", [{ addresses: [a] }]); } catch (e) { if (e instanceof RpcRateLimited) throw e; return null; } }
  async getAddressDeltas(a: string) { try { return await this.call<RpcAddressDelta[]>("getaddressdeltas", [{ addresses: [a] }]); } catch (e) { if (e instanceof RpcRateLimited) throw e; return null; } }
}

export class MockRpcClient implements ZcashRpc {
  readonly mocked = true;
  async getBlockchainInfo() { return mock.mockBlockchainInfo(); }
  async getBlockHash(h: number) {
    if (h > mock.mockTipHeight()) throw new RpcError("Block height out of range", -8);
    return mock.mockBlockHash(h);
  }
  async getBlock(id: string) {
    const h = /^\d+$/.test(id) ? Number(id) : mock.mockHeightFromHash(id);
    return h === null ? null : mock.mockBlock(h);
  }
  async getBlockCount() { return mock.mockTipHeight(); }
  async getBestBlockHash() { return mock.mockBlockHash(mock.mockTipHeight()); }
  async getMiningInfo() { return mock.mockMiningInfo(); }
  async getNetworkSolPs() { return mock.mockMiningInfo().networksolps ?? null; }
  async getRawTransaction(txid: string) { return mock.mockTx(txid); }
  async getAddressBalance(a: string) { return mock.mockAddressBalance(a); }
  async getAddressDeltas(a: string) { return mock.mockAddressDeltas(a); }
  async getAddressTxids(a: string) { return mock.mockAddressDeltas(a).map((d) => d.txid); }
}

let client: ZcashRpc | null = null;
export function getRpc(): ZcashRpc {
  if (client) return client;
  const url = process.env.ZCASH_RPC_URL;
  client = url && process.env.ZCASH_MOCK !== "1"
    ? new HttpRpcClient([url, ...(process.env.ZCASH_RPC_URL_FALLBACK ? [process.env.ZCASH_RPC_URL_FALLBACK] : [])], process.env.ZCASH_RPC_USER, process.env.ZCASH_RPC_PASS)
    : new MockRpcClient();
  return client;
}
export const isMocked = () => getRpc().mocked;
