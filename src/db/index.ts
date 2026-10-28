import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type DB = NeonHttpDatabase<typeof schema>;

// Idempotent bootstrap mirroring schema.ts, so a fresh Neon branch works without a manual
// `drizzle-kit push` (which remains the canonical way to evolve the schema).
const DDL = [
  `CREATE TABLE IF NOT EXISTS blocks (height integer PRIMARY KEY, hash text NOT NULL UNIQUE, time bigint NOT NULL, size integer, tx_count integer NOT NULL, raw text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS status_snapshots (id serial PRIMARY KEY, taken_at bigint NOT NULL, json text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS pool_snapshots (date text PRIMARY KEY, height integer NOT NULL, taken_at bigint NOT NULL, transparent double precision, sprout double precision, sapling double precision, orchard double precision, lockbox double precision, ironwood double precision)`,
  `CREATE TABLE IF NOT EXISTS api_keys (id serial PRIMARY KEY, hash text NOT NULL UNIQUE, prefix text NOT NULL, label text, created_at bigint NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (bucket text NOT NULL, day text NOT NULL, count integer NOT NULL, PRIMARY KEY (bucket, day))`,
  `CREATE TABLE IF NOT EXISTS meta (key text PRIMARY KEY, value text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS revoked_keys (hash text PRIMARY KEY, revoked_at bigint NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rpc_cache (key text PRIMARY KEY, value text NOT NULL, fetched_at bigint NOT NULL)`,
];

const g = globalThis as unknown as { __fordnetDb?: Promise<DB> };

/** Neon Postgres over HTTP (serverless-friendly). DATABASE_URL is required. */
export function getDb(): Promise<DB> {
  g.__fordnetDb ??= (async () => {
    const url = process.env.FORDNET_DATABASE_URL || process.env.DATABASE_URL; // FORDNET_ = current Neon store (fordnet-db-2)
    if (!url) throw new Error("DATABASE_URL is not set (Neon Postgres). See README.");
    const sql = neon(url);
    for (const stmt of DDL) await sql.query(stmt);
    return drizzle(sql, { schema });
  })().catch((e: unknown) => { g.__fordnetDb = undefined; throw e; });
  return g.__fordnetDb;
}
export { schema };
