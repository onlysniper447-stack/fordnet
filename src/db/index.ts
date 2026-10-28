import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

const DDL = `
CREATE TABLE IF NOT EXISTS blocks (height INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE, time INTEGER NOT NULL, size INTEGER, tx_count INTEGER NOT NULL, raw TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS status_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, taken_at INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pool_snapshots (date TEXT PRIMARY KEY, height INTEGER NOT NULL, taken_at INTEGER NOT NULL, transparent REAL, sprout REAL, sapling REAL, orchard REAL, lockbox REAL, ironwood REAL);
CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, label TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (bucket, day));
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export type DB = BetterSQLite3Database<typeof schema>;
const g = globalThis as unknown as { __fordnetDb?: DB };

export function dbPath(): string {
  return process.env.DATABASE_PATH ?? (process.env.VERCEL ? "/tmp/fordnet.db" : resolve(process.cwd(), "data/fordnet.db"));
}

export function getDb(): DB {
  if (g.__fordnetDb) return g.__fordnetDb;
  const p = dbPath();
  mkdirSync(dirname(p), { recursive: true });
  const sqlite = new Database(p);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(DDL);
  const cols = sqlite.prepare("PRAGMA table_info(pool_snapshots)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "ironwood")) sqlite.exec("ALTER TABLE pool_snapshots ADD COLUMN ironwood REAL");
  g.__fordnetDb = drizzle(sqlite, { schema });
  return g.__fordnetDb;
}
export { schema };
