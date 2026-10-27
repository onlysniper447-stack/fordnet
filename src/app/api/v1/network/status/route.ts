import type { NextRequest } from "next/server";
import { handleV1 } from "@/lib/api";
import { getNetworkStatus } from "@/lib/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(req: NextRequest) { return handleV1(req, () => getNetworkStatus()); }
