import type { NextRequest } from "next/server";
import { handleV1, parseOrThrow } from "@/lib/api";
import { blocksQuerySchema } from "@/lib/detect";
import { getRecentBlocks } from "@/lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) {
  return handleV1(req, async () => {
    const { limit } = parseOrThrow(blocksQuerySchema.safeParse({ limit: req.nextUrl.searchParams.get("limit") ?? undefined }));
    return getRecentBlocks(limit);
  });
}
