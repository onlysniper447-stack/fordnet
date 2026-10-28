import { NextResponse, type NextRequest } from "next/server";
import { clientIp, isPrefetch, VisitorLimiter } from "@/lib/visitor-limit";
import { sharedLookupHit } from "@/lib/lookup-limit-db";

const limiter = new VisitorLimiter();
const BOT = /bot\b|crawler|spider|crawl|facebookexternalhit|meta-externalagent|slurp|headless/i;
const LOOKUP = /^\/(block|tx|address)\/|^\/search$/;

// Malformed ids on detail pages get a real HTTP 400 with the friendly /invalid page.
const RULES: { prefix: string; kind: string; ok: RegExp }[] = [
  { prefix: "/block/", kind: "block", ok: /^(\d{1,9}|[0-9a-fA-F]{64})$/ },
  { prefix: "/tx/", kind: "tx", ok: /^[0-9a-fA-F]{64}$/ },
  { prefix: "/address/", kind: "address", ok: /^t[13][1-9A-HJ-NP-Za-km-z]{33}$/ },
];

export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (LOOKUP.test(p) && (p !== "/search" || req.nextUrl.searchParams.get("q"))) {
    const ua = req.headers.get("user-agent")?.trim();
    if (!ua) return rewriteTo(req, "/rate-limited", "?reason=agent", 403, {}); // lookups cost node quota; every real browser sends a UA
    if (BOT.test(ua)) return rewriteTo(req, "/rate-limited", "?reason=bot", 403, { "X-Robots-Tag": "noindex" }); // ~39k crawler hits/day drained the node quota
    if (!isPrefetch(req.headers)) {
      const ip = clientIp(req.headers);
      // shared counter (Postgres) so the limit holds across edge instances; memory limiter if the DB is unavailable
      const over = await sharedLookupHit(ip).catch(() => limiter.hit(ip));
      if (over) return rewriteTo(req, "/rate-limited", `?reason=${over.scope}&retry=${over.retryAfterSec}`, 429, { "Retry-After": String(over.retryAfterSec), "Cache-Control": "no-store" });
    }
  }
  for (const r of RULES) {
    if (!p.startsWith(r.prefix)) continue;
    const id = decodeURIComponent(p.slice(r.prefix.length));
    if (r.ok.test(id)) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/invalid";
    url.search = `?kind=${r.kind}`;
    return NextResponse.rewrite(url, { status: 400 });
  }
  return NextResponse.next();
}

function rewriteTo(req: NextRequest, path: string, search: string, status: number, headers: Record<string, string>) {
  const url = req.nextUrl.clone();
  url.pathname = path; url.search = search;
  const res = NextResponse.rewrite(url, { status });
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}
export const config = { matcher: ["/block/:path*", "/tx/:path*", "/address/:path*", "/search"] };
