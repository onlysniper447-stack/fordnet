import { pgTable, text, integer, bigint, doublePrecision, serial, primaryKey } from "drizzle-orm/pg-core";

export const blocks = pgTable("blocks", {
  height: integer("height").primaryKey(),
  hash: text("hash").notNull().unique(),
  time: bigint("time", { mode: "number" }).notNull(),
  size: integer("size"),
  txCount: integer("tx_count").notNull(),
  raw: text("raw").notNull(), // JSON of RpcBlock (verbosity 2, tx hex stripped)
});

export const statusSnapshots = pgTable("status_snapshots", {
  id: serial("id").primaryKey(),
  takenAt: bigint("taken_at", { mode: "number" }).notNull(), // unix ms
  json: text("json").notNull(), // NetworkStatus
});

export const poolSnapshots = pgTable("pool_snapshots", {
  date: text("date").primaryKey(), // YYYY-MM-DD UTC
  height: integer("height").notNull(),
  takenAt: bigint("taken_at", { mode: "number" }).notNull(),
  transparent: doublePrecision("transparent"),
  sprout: doublePrecision("sprout"),
  sapling: doublePrecision("sapling"),
  orchard: doublePrecision("orchard"),
  lockbox: doublePrecision("lockbox"),
  ironwood: doublePrecision("ironwood"),
});

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  hash: text("hash").notNull().unique(), // sha256 of key; plaintext never stored
  prefix: text("prefix").notNull(),
  label: text("label"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const rateLimits = pgTable("rate_limits", {
  bucket: text("bucket").notNull(),
  day: text("day").notNull(),
  count: integer("count").notNull(),
}, (t) => [primaryKey({ columns: [t.bucket, t.day] })]);

export const meta = pgTable("meta", { key: text("key").primaryKey(), value: text("value").notNull() });
