import type { Metadata } from "next";
import { headers } from "next/headers";
import { Card, PageTitle } from "@/components/ui";
import { KeyGenerator } from "@/components/key-generator";
import { CodeBlock } from "@/components/code";

export const metadata: Metadata = { title: "Developers" };

const ENDPOINTS = [
  { path: "/api/v1/network/status", desc: "Sync state, height, hashrate, difficulty, last block, pool values.", params: "—" },
  { path: "/api/v1/blocks?limit=20", desc: "Most recent blocks, newest first.", params: "limit 1–50 (default 20)" },
  { path: "/api/v1/blocks/{heightOrHash}", desc: "One block with per-tx public summaries.", params: "height (int) or 64-hex hash" },
  { path: "/api/v1/tx/{txid}", desc: "Public fields of a transaction; shielded parts as counts only.", params: "64-hex txid" },
  { path: "/api/v1/address/{taddr}", desc: "Transparent balance + recent transparent txs.", params: "t1… or t3… address" },
  { path: "/api/v1/pools/history?range=30d", desc: "Daily value-pool snapshots (ZEC).", params: "range 7d | 30d | all" },
];

export default async function Developers() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const base = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageTitle eyebrow="Developers" title="Fordnet REST API v1"><p className="mt-1 text-sm text-muted">Public Zcash chain data as JSON. Free keys, 200 requests/day each.</p></PageTitle>
      <section aria-labelledby="qs"><h2 id="qs" className="mb-3 font-semibold">Quick start</h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm">
          <li>Generate a key below. It&apos;s shown once; we store only its SHA-256 hash.</li>
          <li>Send it in the <code className="num">x-api-key</code> header.</li>
          <li>Every response is <code className="num">{"{ data, meta, error }"}</code>. Errors set <code className="num">data: null</code> and a readable <code className="num">error.message</code>.</li>
        </ol>
      </section>
      <section aria-labelledby="key"><h2 id="key" className="mb-3 font-semibold">Get an API key</h2><Card><KeyGenerator /></Card></section>
      <section aria-labelledby="ex"><h2 id="ex" className="mb-3 font-semibold">curl examples</h2>
        <div className="space-y-3">
          <CodeBlock code={`export FORDNET_KEY=fn_your_key_here\ncurl -s -H "x-api-key: $FORDNET_KEY" ${base}/api/v1/network/status`} />
          <CodeBlock code={`curl -s -H "x-api-key: $FORDNET_KEY" "${base}/api/v1/blocks?limit=5"`} />
          <CodeBlock code={`curl -s -H "x-api-key: $FORDNET_KEY" ${base}/api/v1/blocks/2500000`} />
          <CodeBlock code={`curl -s -H "x-api-key: $FORDNET_KEY" "${base}/api/v1/pools/history?range=7d"`} />
        </div>
      </section>
      <section aria-labelledby="ref"><h2 id="ref" className="mb-3 font-semibold">Endpoint reference</h2>
        <ul className="space-y-3">{ENDPOINTS.map((e) => (
          <li key={e.path}><Card><p className="num break-all text-sm"><span className="mr-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent-text">GET</span>{e.path}</p><p className="mt-2 text-sm">{e.desc}</p><p className="mt-1 text-xs text-muted">Params: {e.params}</p></Card></li>
        ))}</ul>
      </section>
      <section aria-labelledby="lim"><h2 id="lim" className="mb-3 font-semibold">Errors, limits &amp; caching</h2>
        <Card><dl className="space-y-2 text-sm">
          <div><dt className="num inline">400</dt><dd className="inline text-muted"> — invalid input (message says what&apos;s wrong)</dd></div>
          <div><dt className="num inline">401</dt><dd className="inline text-muted"> — missing or unknown x-api-key</dd></div>
          <div><dt className="num inline">404</dt><dd className="inline text-muted"> — block/tx not found</dd></div>
          <div><dt className="num inline">429</dt><dd className="inline text-muted"> — over 200 req/day; honour <code className="num">Retry-After</code> (seconds to UTC midnight)</dd></div>
          <div><dt className="num inline">503</dt><dd className="inline text-muted"> — node unreachable (8s timeout, retried once, fallback URL if set)</dd></div>
          <p className="pt-2 text-muted">Headers: <code className="num">X-RateLimit-Limit / -Remaining / -Reset</code>. Responses are cached for 30 seconds.</p>
        </dl></Card>
      </section>
    </div>
  );
}
