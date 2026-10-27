import type { NextRequest } from "next/server";
import { handleV1, parseOrThrow, NotFound } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { heightOrHashSchema } from "@/lib/detect";
import { getBlockDetail } from "@/lib/service";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleV1(req, async () => {
    const v = parseOrThrow(heightOrHashSchema.safeParse(id));
    const b = await getBlockDetail(String(v));
    if (!b) throw new NotFound(`No block found for "${id}".`);
    return b;
  });
}
