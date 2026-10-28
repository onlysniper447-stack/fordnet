// Shared domain + RPC types. No `any` allowed here.

export interface RpcValuePool {
  id: string;
  monitored: boolean;
  chainValue?: number;
  chainValueZat?: number;
}

export interface RpcBlockchainInfo {
  chain: string;
  blocks: number;
  headers?: number;
  bestblockhash: string;
  difficulty?: number;
  verificationprogress?: number;
  valuePools?: RpcValuePool[];
}

export interface RpcMiningInfo {
  networksolps?: number;
  networkhashps?: number;
  difficulty?: number;
}

export interface RpcVin {
  coinbase?: string;
  txid?: string;
  vout?: number;
  address?: string;
  value?: number;
}

export interface RpcVout {
  value: number;
  n: number;
  scriptPubKey: { type?: string; addresses?: string[]; address?: string };
}

export interface RpcTx {
  txid: string;
  version?: number;
  size?: number;
  locktime?: number;
  expiryheight?: number;
  vin: RpcVin[];
  vout: RpcVout[];
  vShieldedSpend?: unknown[];
  vShieldedOutput?: unknown[];
  vjoinsplit?: unknown[];
  orchard?: { actions?: unknown[] };
  blockhash?: string;
  height?: number;
  confirmations?: number;
  time?: number;
  blocktime?: number;
}

export interface RpcBlock {
  hash: string;
  height: number;
  time: number;
  size?: number;
  confirmations?: number;
  previousblockhash?: string;
  nextblockhash?: string;
  difficulty?: number;
  tx: RpcTx[];
  valuePools?: RpcValuePool[];
}

export interface RpcAddressBalance {
  balance: number; // zatoshis
  received: number; // zatoshis
}

export interface RpcAddressDelta {
  txid: string;
  height: number;
  satoshis: number;
}

/** Driven by data freshness: synced/lagging (data < 5 min old), delayed (5-15 min), unreachable (> 15 min and attempts failing). */
export type SyncState = "synced" | "lagging" | "delayed" | "unreachable";

export interface Degraded {
  reason: "rate_limited" | "provider_error" | "unreachable" | "stale";
  since: number | null; // unix ms of first failure
  retryAt: number | null; // unix ms when we will try the node again
  detail?: string; // last error message (no secrets)
}

export interface PoolValues {
  transparent: number | null;
  sprout: number | null;
  sapling: number | null;
  orchard: number | null;
  lockbox: number | null;
  ironwood: number | null;
}

export interface NetworkStatus {
  state: SyncState;
  live: boolean; // false => served from last snapshot
  mocked: boolean;
  chain: string | null;
  height: number | null;
  headers: number | null;
  bestBlockHash: string | null;
  hashrateSolPerSec: number | null;
  difficulty: number | null;
  lastBlockTime: number | null; // unix seconds
  lastBlockTxCount: number | null;
  verificationProgress: number | null;
  pools: PoolValues;
  snapshotAt: number | null; // unix ms of data
  degraded: Degraded | null; // set when data is older than 5 min
  /** Last provider hiccup, informational only (raw JSON); never changes the state by itself. */
  providerNote?: Degraded | null;
  /** Set when the database is unavailable and the status comes straight from the node. */
  storage?: string | null;
}

export interface BlockSummary {
  height: number;
  hash: string;
  time: number;
  size: number | null;
  txCount: number;
}

export interface TxSummary {
  txid: string;
  transparentInputs: number;
  transparentOutputs: number;
  transparentOutputTotal: number;
  shieldedComponents: number;
  coinbase: boolean;
}

export interface BlockDetail extends BlockSummary {
  confirmations: number | null;
  previousHash: string | null;
  nextHash: string | null;
  difficulty: number | null;
  txs: TxSummary[];
}

export interface TxDetail {
  txid: string;
  blockHash: string | null;
  height: number | null;
  time: number | null;
  confirmations: number | null;
  size: number | null;
  version: number | null;
  coinbase: boolean;
  inputs: { txid: string | null; vout: number | null; address: string | null; value: number | null }[];
  outputs: { n: number; value: number; address: string | null; type: string | null }[];
  shielded: { saplingSpends: number; saplingOutputs: number; orchardActions: number; sproutJoinSplits: number };
}

export interface AddressInfo {
  address: string;
  balanceZec: number | null;
  receivedZec: number | null;
  txs: { txid: string; height: number | null; deltaZec: number | null }[] | null;
  indexAvailable: boolean;
}

export interface PoolPoint extends PoolValues {
  date: string; // YYYY-MM-DD (UTC)
  height: number;
}

export type PoolRange = "7d" | "30d" | "all";
