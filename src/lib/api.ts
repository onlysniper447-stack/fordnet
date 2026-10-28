import { NextResponse, type NextRequest } from "next/server";
import { verifyApiKey, DbCounterStore } from "./apikeys";
import { checkRateLimit, type RateLimitResult } from "./ratelimit";
import { isMocked } from "./rpc";
import { StorageUnavailable } from "./dbguard";
import { BudgetExhausted } from "./rpc-budget";

export interface ApiError { code: string; message: string }
export interface ApiEnvelope<T> { data: T | null; meta: Record<string, unknown>; error: ApiError | null }

const store = new DbCounterStore();
const cache = new Map<string, { at: number; body: unknown }>();
const CACHE_MS = 30_000;

function rlHeaders(rl: RateLimitResult): Record<string, string> {
  return { "X-RateLimit-Limit": String(rl.limit), "X-RateLimit-Remaining": String(rl.remaining), "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)) };
}

export function apiError(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  const body: ApiEnvelope<null> = { data: null, meta: { mocked: isMocked() }, error: { code, message } };
  return NextResponse.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } }); // errors are never cached
}

export class BadRequest extends Error {}
export class NotFound extends Error {}

/** Auth + rate limit + envelope + 30s cache for v1 routes. */
export async function handleV1<T>(req: NextRequest, produce: () => Promise<T>, opts: { cache?: boolean } = { cache: true }) {
  const key = req.headers.get("x-api-key");
  if (!key) return apiError(401, "missing_api_key", "Send your API key in the x-api-key header. Get one free at /developers.");
  const keyHash = await verifyApiKey(key);
  if (!keyHash) return apiError(401, "invalid_api_key", "API key not recognised. Generate a new one at /developers.");
  const rl = await checkRateLimit(store, `key:${keyHash}`);
  if (!rl.allowed) return apiError(429, "rate_limited", `Daily limit of ${rl.limit} requests reached. Retry after ${rl.retryAfterSec}s (UTC midnight).`, { ...rlHeaders(rl), "Retry-After": String(rl.retryAfterSec) });
  const headers = { ...rlHeaders(rl), "Cache-Control": opts.cache === false ? "no-store" : "private, max-age=30" };
  const ck = req.nextUrl.pathname + req.nextUrl.search;
  try {
    const hit = opts.cache !== false ? cache.get(ck) : undefined;
    let data: T;
    let cached = false;
    if (hit && Date.now() - hit.at < CACHE_MS) { data = hit.body as T; cached = true; }
    else { data = await produce(); if (opts.cache !== false) cache.set(ck, { at: Date.now(), body: data }); }
    const body: ApiEnvelope<T> = { data, meta: { mocked: isMocked(), cached, generatedAt: new Date().toISOString(), source: isMocked() ? "MOCKED Zcash RPC" : "Zcash node JSON-RPC" }, error: null };
    return NextResponse.json(body, { headers });
  } catch (e) {
    if (e instanceof BadRequest) return apiError(400, "bad_request", e.message, headers);
    if (e instanceof NotFound) return apiError(404, "not_found", e.message, headers);
    if (e instanceof BudgetExhausted) return apiError(503, "node_budget_exhausted", `${e.message} (protects the shared node quota). Stored data endpoints still work; try lookups again after 00:00 UTC.`, headers);
    if (e instanceof StorageUnavailable) return apiError(503, "storage_unavailable", `${e.message}. Try again later.`, headers);
    return apiError(503, "upstream_unavailable", "The Zcash node did not respond (8s timeout, retried once). Try again shortly.", headers);
  }
}

export function parseOrThrow<T>(r: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }): T {
  if (!r.success) throw new BadRequest(r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}
