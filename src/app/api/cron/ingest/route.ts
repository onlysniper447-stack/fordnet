import { NextResponse, type NextRequest } from "next/server";
import { ingestIfDue } from "@/lib/ingest";
import { getDb, schema } from "@/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (req.nextUrl.searchParams.get("debug") === "1") {
    const rows = await (await getDb()).select().from(schema.meta);
    const probe = async (method: string, params: unknown[]) => {
      const t = Date.now();
      try {
        const r = await fetch(process.env.ZCASH_RPC_URL ?? "", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "1.0", id: 1, method, params }), signal: AbortSignal.timeout(20_000), cache: "no-store" });
        const body = await r.text();
        return { method, status: r.status, ms: Date.now() - t, bytes: body.length, head: body.slice(0, 120) };
      } catch (e) { return { method, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t }; }
    };
    const probes = [await probe("getblockcount", []), await probe("getblockchaininfo", []), await probe("getnetworksolps", [])];
    return NextResponse.json({ now: Date.now(), region: process.env.VERCEL_REGION ?? null, meta: Object.fromEntries(rows.map((r) => [r.key, r.value])), probes });
  }
  try { return NextResponse.json({ ok: true, ...(await ingestIfDue({ force: true, ...(req.nextUrl.searchParams.get("full") === "1" ? { maxNewBlocks: 100, maxBackfillPerRun: 30, budgetMs: 50_000 } : {}) })) ?? { skipped: "lease held by another instance or provider backoff active" } }); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "ingest failed" }, { status: 503 }); }
}
