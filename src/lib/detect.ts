import { z } from "zod";

export const heightSchema = z.string().regex(/^\d{1,9}$/, "Block height must be a non-negative integer").transform(Number);
export const hex64Schema = z.string().regex(/^[0-9a-fA-F]{64}$/, "Must be a 64-character hex string").transform((s) => s.toLowerCase());
export const taddrSchema = z.string().regex(/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/, "Must be a transparent address starting with t1 or t3 (35 base58 characters)");
export const heightOrHashSchema = z.union([heightSchema, hex64Schema], { message: "Expected a block height (integer) or a 64-character hex block hash" });
export const blocksQuerySchema = z.object({ limit: z.coerce.number({ message: "limit must be a number" }).int("limit must be an integer").min(1, "limit must be at least 1").max(50, "limit must be at most 50").default(20) });
export const rangeSchema = z.enum(["7d", "30d", "all"], { message: "range must be one of 7d, 30d, all" }).default("30d");

export type DetectedInput =
  | { type: "height"; value: number }
  | { type: "hex64"; value: string; likely: "block" | "tx" }
  | { type: "taddr"; value: string }
  | { type: "shielded"; value: string }
  | { type: "empty" }
  | { type: "unknown"; value: string; reason: string };

/** Classify a search query. Block hash vs txid can't be told apart syntactically; `likely` is a hint (PoW block hashes start with zeros). */
export function detectInput(raw: string): DetectedInput {
  const q = raw.trim().replace(/,/g, "");
  if (!q) return { type: "empty" };
  if (/^\d+$/.test(q)) {
    return q.length <= 9 ? { type: "height", value: Number(q) } : { type: "unknown", value: q, reason: "That number is too large to be a block height." };
  }
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(q)) {
    const v = q.replace(/^0x/, "").toLowerCase();
    return { type: "hex64", value: v, likely: v.startsWith("0000") ? "block" : "tx" };
  }
  if (taddrSchema.safeParse(q).success) return { type: "taddr", value: q };
  if (/^(zs1|u1|zc|zt|utest)/i.test(q)) return { type: "shielded", value: q };
  if (/^[0-9a-fA-F]+$/.test(q)) return { type: "unknown", value: q, reason: `Hashes and txids are 64 hex characters; this has ${q.length}.` };
  if (/^t/.test(q)) return { type: "unknown", value: q, reason: "Transparent addresses start with t1 or t3 and are 35 characters long." };
  return { type: "unknown", value: q, reason: "Try a block height, a 64-character block hash or txid, or a t1/t3 address." };
}
