import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { CounterStore } from "./ratelimit";

export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

// Keys carry an HMAC tag (KEY_SIGNING_SECRET) so they verify on any serverless instance even when
// its local SQLite file is fresh. Only the SHA-256 hash of the full key is ever stored.
const secret = () => process.env.KEY_SIGNING_SECRET ?? "fordnet-dev-only-secret";
const tag = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 16);

export function createApiKey(label: string | null): { key: string; prefix: string } {
  const body = randomBytes(18).toString("base64url");
  const key = `fn_${body}.${tag(body)}`;
  const prefix = key.slice(0, 7);
  getDb().insert(schema.apiKeys).values({ hash: hashKey(key), prefix, label, createdAt: Date.now() }).run();
  return { key, prefix };
}

export function verifyApiKey(key: string): string | null {
  const h = hashKey(key);
  const r = getDb().select({ hash: schema.apiKeys.hash }).from(schema.apiKeys).where(eq(schema.apiKeys.hash, h)).get();
  if (r) return r.hash;
  const m = /^fn_([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{16})$/.exec(key);
  if (!m) return null;
  const a = Buffer.from(tag(m[1])); const b = Buffer.from(m[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  getDb().insert(schema.apiKeys).values({ hash: h, prefix: key.slice(0, 7), label: null, createdAt: Date.now() }).onConflictDoNothing().run();
  return h;
}

export class DbCounterStore implements CounterStore {
  increment(bucket: string, day: string): number {
    const r = getDb().insert(schema.rateLimits).values({ bucket, day, count: 1 })
      .onConflictDoUpdate({ target: [schema.rateLimits.bucket, schema.rateLimits.day], set: { count: sql`${schema.rateLimits.count} + 1` } })
      .returning({ count: schema.rateLimits.count }).get();
    return r.count;
  }
}
