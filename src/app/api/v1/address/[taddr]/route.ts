import type { NextRequest } from "next/server";
import { handleV1, parseOrThrow } from "@/lib/api";
import { taddrSchema } from "@/lib/detect";
import { getAddressInfo } from "@/lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ taddr: string }> }) {
  const { taddr } = await params;
  return handleV1(req, async () => getAddressInfo(parseOrThrow(taddrSchema.safeParse(taddr))));
}
