import type { NextRequest } from "next/server";
import { handleV1, parseOrThrow, NotFound } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { hex64Schema } from "@/lib/detect";
import { getTxDetail } from "@/lib/service";
export async function GET(req: NextRequest, { params }: { params: Promise<{ txid: string }> }) {
  const { txid } = await params;
  return handleV1(req, async () => {
    const v = parseOrThrow(hex64Schema.safeParse(txid));
    const t = await getTxDetail(v);
    if (!t) throw new NotFound(`No transaction found for "${txid}".`);
    return t;
  });
}
