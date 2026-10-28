import { NextResponse, type NextRequest } from "next/server";
import { flushRpcUsage, ingestIfDue } from "@/lib/ingest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { const r = await ingestIfDue({ force: true, ...(req.nextUrl.searchParams.get("full") === "1" ? { maxNewBlocks: 100, maxBackfillPerRun: 30, budgetMs: 50_000 } : {}) }) ; await flushRpcUsage(); return NextResponse.json({ ok: true, ...(r ?? { skipped: "lease held by another instance or provider backoff active" }) }); }
  catch (e) {
    const c = e instanceof Error && e.cause instanceof Error ? e.cause.message : null; // drizzle wraps the driver error; its message embeds the whole query
    const msg = (c ?? (e instanceof Error ? e.message : "ingest failed")).replace(/(https?|postgres(ql)?):\/\/\S+/g, "[url]").slice(0, 300);
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}
