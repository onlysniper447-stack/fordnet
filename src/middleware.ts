import { NextResponse, type NextRequest } from "next/server";

// Malformed ids on detail pages get a real HTTP 400 with the friendly /invalid page.
const RULES: { prefix: string; kind: string; ok: RegExp }[] = [
  { prefix: "/block/", kind: "block", ok: /^(\d{1,9}|[0-9a-fA-F]{64})$/ },
  { prefix: "/tx/", kind: "tx", ok: /^[0-9a-fA-F]{64}$/ },
  { prefix: "/address/", kind: "address", ok: /^t[13][1-9A-HJ-NP-Za-km-z]{33}$/ },
];

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
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
export const config = { matcher: ["/block/:path*", "/tx/:path*", "/address/:path*"] };
