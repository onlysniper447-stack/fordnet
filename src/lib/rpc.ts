import type { RpcBlock, RpcBlockchainInfo, RpcMiningInfo, RpcTx, RpcAddressBalance, RpcAddressDelta } from "./types";
import * as mock from "./mock";

export class RpcError extends Error {
  constructor(message: string, public code: number | null = null) {
    super(message);
  }
}

/** Single interface shared by the live and the MOCKED client. */
export interface ZcashRpc {
  readonly mocked: boolean;
  getBlockchainInfo(): Promise<RpcBlockchainInfo>;
  getBlockHash(height: number): Promise<string>;
  getBlock(hashOrHeight: string): Promise<RpcBlock | null>;
  getMiningInfo(): Promise<RpcMiningInfo>;
  getNetworkSolPs(): Promise<number | null>;
  getRawTransaction(txid: string): Promise<RpcTx | null>;
  getAddressBalance(addr: string): Promise<RpcAddressBalance | null>;
  getAddressDeltas(addr: string): Promise<RpcAddressDelta[] | null>;
}

const TIMEOUT_MS = 5000;
const NOT_FOUND_CODES = new Set([-5, -8]);

export class HttpRpcClient implements ZcashRpc {
  readonly mocked = false;
  constructor(private url: string, private user?: string, private pass?: string) {}

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.once<T>(method, params);
      } catch (e) {
        if (e instanceof RpcError && e.code !== null) throw e; // node answered: don't retry
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new RpcError(String(lastErr));
  }

  private async once<T>(method: string, params: unknown[]): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.user || this.pass) headers.authorization = "Basic " + Buffer.from(`${this.user ?? ""}:${this.pass ?? ""}`).toString("base64");
    const res = await fetch(this.url, {
      method: "POST", headers, cache: "no-store",
      body: JSON.stringify({ jsonrpc: "1.0", id: "fordnet", method, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
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
  getBlock(id: string) { return this.nullOnNotFound(this.call<RpcBlock>("getblock", [id, 2])); }
  getMiningInfo() { return this.call<RpcMiningInfo>("getmininginfo"); }
  async getNetworkSolPs() { try { return await this.call<number>("getnetworksolps"); } catch { return null; } }
  getRawTransaction(txid: string) { return this.nullOnNotFound(this.call<RpcTx>("getrawtransaction", [txid, 1])); }
  // Address index RPCs need zcashd -insightexplorer / -lightwalletd; null => "not reported".
  async getAddressBalance(a: string) { try { return await this.call<RpcAddressBalance>("getaddressbalance", [{ addresses: [a] }]); } catch { return null; } }
  async getAddressDeltas(a: string) { try { return await this.call<RpcAddressDelta[]>("getaddressdeltas", [{ addresses: [a] }]); } catch { return null; } }
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
  async getMiningInfo() { return mock.mockMiningInfo(); }
  async getNetworkSolPs() { return mock.mockMiningInfo().networksolps ?? null; }
  async getRawTransaction(txid: string) { return mock.mockTx(txid); }
  async getAddressBalance(a: string) { return mock.mockAddressBalance(a); }
  async getAddressDeltas(a: string) { return mock.mockAddressDeltas(a); }
}

let client: ZcashRpc | null = null;
export function getRpc(): ZcashRpc {
  if (client) return client;
  const url = process.env.ZCASH_RPC_URL;
  client = url && process.env.ZCASH_MOCK !== "1"
    ? new HttpRpcClient(url, process.env.ZCASH_RPC_USER, process.env.ZCASH_RPC_PASS)
    : new MockRpcClient();
  return client;
}
export const isMocked = () => getRpc().mocked;
