import Link from "next/link";
import { headers } from "next/headers";
import { Suspense } from "react";
import { ArrowRight, ArrowDown } from "lucide-react";
import { btnGhost, btnPrimary } from "@/components/ui";
import { LiveResponse, LiveResponseSkeleton, LiveStrip, LiveStripSkeleton } from "@/components/home/live";

export const dynamic = "force-dynamic";

const PROBLEMS = [
  { n: "01", title: "Basic facts need a node", body: "Answering \u201cis the chain moving and how fast\u201d means syncing zcashd or Zebra (hundreds of GB) and parsing JSON-RPC output by hand." },
  { n: "02", title: "Explorers aren\u2019t APIs", body: "Block explorers are built for people. Scraping them breaks on every redesign, and few offer a documented, versioned interface with clear limits." },
  { n: "03", title: "Pool supply has no simple history", body: "How much ZEC sits in Sapling or Orchard is in every block\u2019s valuePools, but there is no easy daily series to chart or download." },
  { n: "04", title: "Tooling can leak privacy", body: "Analytics tools that guess shielded senders, recipients or amounts undermine the reason Zcash exists. Users can\u2019t always tell which tools do this." },
];

const SOLUTIONS = [
  { problem: "01", title: "Hosted node reads", body: "An ingest job refreshes from the node whenever stored data is more than a minute old, keeping the last 100 blocks and a status snapshot. You read the result, not the raw RPC.", href: "/dashboard", cta: "Open dashboard" },
  { problem: "02", title: "Versioned REST API", body: "Six read-only /api/v1 endpoints with one response shape, zod-validated input, clear 400/404/429 errors and 200 free requests a day per key.", href: "/developers", cta: "Read the API docs" },
  { problem: "03", title: "Daily value-pool series", body: "One snapshot per UTC day, read from each block\u2019s valuePools. Chart it per pool or stacked, view it as a table, or fetch it as JSON.", href: "/analytics#pools", cta: "See pool history" },
  { problem: "04", title: "Public data only, by design", body: "Shielded transactions are shown as component counts. Fordnet stores no shielded amounts or parties and never attempts to infer them.", href: "#privacy", cta: "Privacy commitment" },
];

const STEPS = [
  { title: "Zcash node", body: "Zebra or zcashd, JSON-RPC" },
  { title: "Ingest", body: "Refresh if > 60 s old · 5 s timeout, 1 retry" },
  { title: "Postgres", body: "Blocks, snapshots, key hashes" },
  { title: "API + dashboard", body: "Same data, two interfaces" },
];

const AUDIENCE = [
  { title: "Wallet developers", body: "Check chain tip and sync state before broadcasting, or show a transparent balance without running an indexer." },
  { title: "Researchers", body: "Pull the daily pool series into a notebook to study shielded adoption, using only data the protocol already publishes." },
  { title: "Bot and alert builders", body: "Poll status and recent blocks on a predictable schema with documented rate limits and Retry-After." },
];

const ROADMAP = [
  "Always-on ingest worker alongside the scheduled job",
  "lightwalletd as an additional data source",
  "Webhooks for new blocks and pool thresholds",
  "Per-key usage view on the developers page",
  "Network-upgrade and ZSA tracking",
  "OpenAPI spec and a TypeScript SDK",
];

function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-wider text-accent-text">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      {children && <p className="mt-3 text-muted">{children}</p>}
    </div>
  );
}

export default async function Home() {
  const host = (await headers()).get("host") ?? "fordnet.vercel.app";
  return (
    <div className="space-y-20 pb-8 sm:space-y-28">
      {/* Hero */}
      <section aria-labelledby="hero" className="pt-4 sm:pt-10">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Zcash mainnet · public protocol data</p>
        <h1 id="hero" className="mt-3 max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-tight sm:text-5xl">Zcash network data you can query in one request.</h1>
        <p className="mt-4 max-w-2xl text-base text-muted sm:text-lg">Fordnet reads a Zcash node, keeps what it serves at most a minute old, and exposes blocks, transactions, transparent addresses and value-pool history through a dashboard and a versioned REST API. It never infers anything about shielded activity.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard" className={btnPrimary}>Open dashboard <ArrowRight aria-hidden className="h-4 w-4" /></Link>
          <Link href="/developers#key" className={btnGhost}>Get an API key</Link>
        </div>
        <div className="mt-10">
          <Suspense fallback={<LiveStripSkeleton />}><LiveStrip /></Suspense>
        </div>
      </section>

      {/* Problem */}
      <section aria-labelledby="problem">
        <SectionHead id="problem" eyebrow="The problem" title="Simple questions about Zcash are harder to answer than they should be." />
        <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          {PROBLEMS.map((p) => (
            <li key={p.n} className="bg-surface p-5">
              <p className="num text-sm text-muted">{p.n}</p>
              <h3 className="mt-2 font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-muted">{p.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Solution */}
      <section aria-labelledby="solution">
        <SectionHead id="solution" eyebrow="What Fordnet does" title="One answer for each of those problems." />
        <ul className="divide-y divide-border rounded-xl border border-border">
          {SOLUTIONS.map((s) => (
            <li key={s.problem} className="grid gap-2 p-5 sm:grid-cols-[3rem_1fr_auto] sm:items-baseline sm:gap-6">
              <p className="num text-sm text-muted"><span className="sr-only">Solves problem </span>{s.problem}</p>
              <div className="min-w-0">
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </div>
              <Link href={s.href} className="inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline">{s.cta} <ArrowRight aria-hidden className="h-3.5 w-3.5" /></Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Example */}
      <section aria-labelledby="example" className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        <SectionHead id="example" eyebrow="Try it" title="A real request, a real response.">
          Create a key on the developers page, export it as <code className="num text-fg">FORDNET_KEY</code>, and run this. Every endpoint returns the same <code className="num text-fg">{"{ data, meta, error }"}</code> shape.
        </SectionHead>
        <Suspense fallback={<LiveResponseSkeleton />}><LiveResponse host={host} /></Suspense>
      </section>

      {/* How it works */}
      <section aria-labelledby="how">
        <SectionHead id="how" eyebrow="How it works" title="Four parts, no hidden steps." />
        <ol className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          {STEPS.map((s, i) => (
            <li key={s.title} className="contents">
              <div className="h-full rounded-xl border border-border bg-surface p-4">
                <p className="num text-xs text-muted">{String(i + 1).padStart(2, "0")}</p>
                <p className="mt-1 font-semibold">{s.title}</p>
                <p className="text-sm text-muted">{s.body}</p>
              </div>
              {i < STEPS.length - 1 && (
                <span aria-hidden className="flex items-center justify-center text-muted">
                  <ArrowDown className="h-4 w-4 lg:hidden" /><ArrowRight className="hidden h-4 w-4 lg:block" />
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted">If the node stops answering, pages and the API fall back to the last stored snapshot and show its timestamp. Fields a node doesn&apos;t report are shown as &ldquo;not reported&rdquo;, never estimated.</p>
      </section>

      {/* Privacy */}
      <section id="privacy" aria-labelledby="privacy-h" className="scroll-mt-24 rounded-xl border border-border bg-surface p-6 sm:p-8">
        <SectionHead id="privacy-h" eyebrow="Privacy commitment" title="Fordnet reports only public protocol data." />
        <ul className="grid gap-4 text-sm sm:grid-cols-3">
          <li><p className="font-semibold">What we show</p><p className="mt-1 text-muted">Block headers, transparent inputs and outputs, transparent balances, and pool totals the protocol publishes in every block.</p></li>
          <li><p className="font-semibold">What we count</p><p className="mt-1 text-muted">The number of Sapling spends and outputs, Orchard actions and Sprout JoinSplits in a transaction. Counts only.</p></li>
          <li><p className="font-semibold">What we never do</p><p className="mt-1 text-muted">Store, estimate or link shielded amounts, senders or recipients. Shielded addresses can&apos;t be searched.</p></li>
        </ul>
      </section>

      {/* Audience */}
      <section aria-labelledby="audience">
        <SectionHead id="audience" eyebrow="Built for" title="People who need chain data, not another node to maintain." />
        <ul className="grid gap-6 sm:grid-cols-3">
          {AUDIENCE.map((a) => (
            <li key={a.title} className="border-t-2 border-accent pt-4">
              <h3 className="font-semibold">{a.title}</h3>
              <p className="mt-1 text-sm text-muted">{a.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Roadmap */}
      <section aria-labelledby="roadmap">
        <SectionHead id="roadmap" eyebrow="Roadmap" title="What comes next.">These are planned, not shipped.</SectionHead>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ROADMAP.map((r) => (
            <li key={r} className="flex items-start gap-3 rounded-lg border border-border px-4 py-3 text-sm">
              <span className="mt-0.5 shrink-0 rounded border border-border px-1.5 text-[11px] uppercase tracking-wide text-muted">Planned</span>{r}
            </li>
          ))}
        </ul>
      </section>

      {/* Closing CTA */}
      <section aria-labelledby="cta" className="flex flex-col gap-4 border-t border-border pt-10 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="cta" className="text-xl font-semibold">See the network right now, or start building.</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard" className={btnPrimary}>Open dashboard</Link>
          <Link href="/developers#key" className={btnGhost}>Get an API key</Link>
        </div>
      </section>
    </div>
  );
}
