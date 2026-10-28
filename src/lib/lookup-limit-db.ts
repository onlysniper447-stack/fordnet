import { neon } from "@neondatabase/serverless";
import { PER_DAY, PER_MINUTE } from "./visitor-limit";

/** Shared per-IP lookup counter: one statement (two atomic upserts) per lookup. Edge-safe. Returns null if allowed. */
export async function sharedLookupHit(ip: string, now = Date.now()): Promise<{ retryAfterSec: number; scope: "minute" | "day" } | null> {
  const url = process.env.FORDNET_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("no database");
  const iso = new Date(now).toISOString(); const day = iso.slice(0, 10); const minute = iso.slice(11, 16);
  const sql = neon(url);
  const rows = (await sql.query(
    `WITH m AS (INSERT INTO rate_limits (bucket, day, count) VALUES ($1, $3, 1) ON CONFLICT (bucket, day) DO UPDATE SET count = rate_limits.count + 1 RETURNING count),
          d AS (INSERT INTO rate_limits (bucket, day, count) VALUES ($2, $3, 1) ON CONFLICT (bucket, day) DO UPDATE SET count = rate_limits.count + 1 RETURNING count)
     SELECT (SELECT count FROM m) AS m, (SELECT count FROM d) AS d`,
    [`lkm:${ip}:${minute}`, `lkd:${ip}`, day],
  )) as { m: number; d: number }[];
  const r = rows[0];
  if (r.d > PER_DAY) { const d = new Date(now); return { retryAfterSec: Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 1000), scope: "day" }; }
  if (r.m > PER_MINUTE) return { retryAfterSec: Math.max(1, 60 - new Date(now).getUTCSeconds()), scope: "minute" };
  return null;
}
