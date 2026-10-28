import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createApiKey, DbCounterStore } from "@/lib/apikeys";
import { checkRateLimit } from "@/lib/ratelimit";
import { apiError } from "@/lib/api";
export const runtime = "nodejs";

const body = z.object({ label: z.string().trim().max(60, "Label must be 60 characters or fewer").optional() });
const store = new DbCounterStore();

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await checkRateLimit(store, `keygen:${ip}`, Date.now(), 10);
  if (!rl.allowed) return apiError(429, "rate_limited", "Too many keys created from this network today.", { "Retry-After": String(rl.retryAfterSec) });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid body");
  const { key, prefix } = await createApiKey(parsed.data.label || null);
  return NextResponse.json({ data: { key, prefix, dailyLimit: 200 }, meta: { note: "Shown once. Only a SHA-256 hash is stored." }, error: null }, { headers: { "Cache-Control": "no-store" } });
}
