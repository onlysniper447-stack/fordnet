import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";

export const blocks = sqliteTable("blocks", {
  height: integer("height").primaryKey(),
  hash: text("hash").notNull().unique(),
  time: integer("time").notNull(),
  size: integer("size"),
  txCount: integer("tx_count").notNull(),
  raw: text("raw").notNull(), // JSON of RpcBlock (verbosity 2)
});

export const statusSnapshots = sqliteTable("status_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  takenAt: integer("taken_at").notNull(), // unix ms
  json: text("json").notNull(), // NetworkStatus
});

export const poolSnapshots = sqliteTable("pool_snapshots", {
  date: text("date").primaryKey(), // YYYY-MM-DD UTC
  height: integer("height").notNull(),
  takenAt: integer("taken_at").notNull(),
  transparent: real("transparent"),
  sprout: real("sprout"),
  sapling: real("sapling"),
  orchard: real("orchard"),
  lockbox: real("lockbox"),
  ironwood: real("ironwood"),
});

export const apiKeys = sqliteTable("api_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  hash: text("hash").notNull().unique(), // sha256 of key; plaintext never stored
  prefix: text("prefix").notNull(),
  label: text("label"),
  createdAt: integer("created_at").notNull(),
});

export const rateLimits = sqliteTable("rate_limits", {
  bucket: text("bucket").notNull(),
  day: text("day").notNull(),
  count: integer("count").notNull(),
}, (t) => [primaryKey({ columns: [t.bucket, t.day] })]);

export const meta = sqliteTable("meta", { key: text("key").primaryKey(), value: text("value").notNull() });
