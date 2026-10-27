import { NextResponse, type NextRequest } from "next/server";
import { runIngest } from "@/lib/ingest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runIngest()) }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "ingest failed" }, { status: 503 }); }
}
