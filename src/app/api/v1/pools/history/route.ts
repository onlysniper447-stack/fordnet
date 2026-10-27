import type { NextRequest } from "next/server";
import { handleV1, parseOrThrow } from "@/lib/api";
import { rangeSchema } from "@/lib/detect";
import { getPoolHistory } from "@/lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) {
  return handleV1(req, async () => getPoolHistory(parseOrThrow(rangeSchema.safeParse(req.nextUrl.searchParams.get("range") ?? undefined))));
}
