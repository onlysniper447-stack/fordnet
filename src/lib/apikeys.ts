import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { MemoryCounterStore, type CounterStore } from "./ratelimit";
import { withDb } from "./dbguard";

export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

// Keys carry an HMAC tag (KEY_SIGNING_SECRET) so they verify on any serverless instance even when
// its local SQLite file is fresh. Only the SHA-256 hash of the full key is ever stored.
const secret = () => process.env.KEY_SIGNING_SECRET ?? "fordnet-dev-only-secret";
const tag = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 16);

export async function createApiKey(label: string | null): Promise<{ key: string; prefix: string }> {
  const body = randomBytes(18).toString("base64url");
  const key = `fn_${body}.${tag(body)}`;
  const prefix = key.slice(0, 7);
  await withDb(async () => { await (await getDb()).insert(schema.apiKeys).values({ hash: hashKey(key), prefix, label, createdAt: Date.now() }); }, () => undefined); // HMAC tag keeps it valid either way
  return { key, prefix };
}

const validTag = (key: string) => {
  const m = /^fn_([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{16})$/.exec(key);
  if (!m) return false;
  const a = Buffer.from(tag(m[1])); const b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** DB down: HMAC-tagged keys still verify (revocation list unavailable until it recovers). */
export async function verifyApiKey(key: string): Promise<string | null> {
  return withDb(() => verifyInDb(key), () => (validTag(key) ? hashKey(key) : null));
}
async function verifyInDb(key: string): Promise<string | null> {
  const h = hashKey(key);
  const [r] = await (await getDb()).select({ hash: schema.apiKeys.hash }).from(schema.apiKeys).where(eq(schema.apiKeys.hash, h)).limit(1);
  if (r) return r.hash;
  // A deleted key would otherwise re-register via its valid HMAC tag, so revocations are remembered by hash.
  const [rev] = await (await getDb()).select({ hash: schema.revokedKeys.hash }).from(schema.revokedKeys).where(eq(schema.revokedKeys.hash, h)).limit(1);
  if (rev) return null;
  const m = /^fn_([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{16})$/.exec(key);
  if (!m) return null;
  const a = Buffer.from(tag(m[1])); const b = Buffer.from(m[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  await (await getDb()).insert(schema.apiKeys).values({ hash: h, prefix: key.slice(0, 7), label: null, createdAt: Date.now() }).onConflictDoNothing();
  return h;
}

export class DbCounterStore implements CounterStore {
  private mem = new MemoryCounterStore();
  async increment(bucket: string, day: string): Promise<number> {
    return withDb(() => this.inDb(bucket, day), () => this.mem.increment(bucket, day)); // DB down: per-instance limit
  }
  private async inDb(bucket: string, day: string): Promise<number> {
    const [r] = await (await getDb()).insert(schema.rateLimits).values({ bucket, day, count: 1 })
      .onConflictDoUpdate({ target: [schema.rateLimits.bucket, schema.rateLimits.day], set: { count: sql`${schema.rateLimits.count} + 1` } })
      .returning({ count: schema.rateLimits.count });
    return r.count;
  }
}

/** Delete keys (and their rate-limit rows) and remember their hashes so they cannot re-register. */
export async function revokeKeys(opts: { keys?: string[]; labels?: string[]; prefixes?: string[] }): Promise<number> {
  const db = await getDb();
  const hashes = (opts.keys ?? []).map(hashKey);
  const conds = [...(hashes.length ? [inArray(schema.apiKeys.hash, hashes)] : []), ...(opts.labels?.length ? [inArray(schema.apiKeys.label, opts.labels)] : []), ...(opts.prefixes?.length ? [inArray(schema.apiKeys.prefix, opts.prefixes)] : [])];
  const rows = conds.length ? await db.select({ hash: schema.apiKeys.hash }).from(schema.apiKeys).where(or(...conds)) : [];
  const all = [...new Set([...hashes, ...rows.map((r) => r.hash)])];
  if (!all.length) return 0;
  const now = Date.now();
  await db.insert(schema.revokedKeys).values(all.map((hash) => ({ hash, revokedAt: now }))).onConflictDoNothing();
  await db.delete(schema.apiKeys).where(inArray(schema.apiKeys.hash, all));
  for (const h of all) await db.delete(schema.rateLimits).where(like(schema.rateLimits.bucket, `key:${h}`));
  return all.length;
}
