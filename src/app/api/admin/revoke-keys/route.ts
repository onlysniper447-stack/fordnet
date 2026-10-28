import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { revokeKeys } from "@/lib/apikeys";
export const runtime = "nodejs";

const body = z.object({ keys: z.array(z.string().max(80)).max(50).optional(), labels: z.array(z.string().max(60)).max(20).optional(), prefixes: z.array(z.string().length(7)).max(20).optional() });

/** Operator-only: POST {keys?, labels?, prefixes?} with Authorization: Bearer $CRON_SECRET. */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  return NextResponse.json({ ok: true, revoked: await revokeKeys(parsed.data) }, { headers: { "Cache-Control": "no-store" } });
}
