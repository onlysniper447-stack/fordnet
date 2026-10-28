import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/ui";
export const metadata: Metadata = { title: "Slow down", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RateLimited({ searchParams }: { searchParams: Promise<{ reason?: string; retry?: string }> }) {
  const { reason, retry } = await searchParams;
  const secs = Number(retry);
  if (reason === "agent") return <Notice tone="error" title="Lookups need a browser">Requests without a User-Agent can&apos;t use lookup pages. Scripts can use the <Link className="text-accent-text underline" href="/developers">REST API</Link> with a free key.</Notice>;
  if (reason === "bot") return <Notice tone="warn" title="Lookup pages aren&apos;t available to crawlers">Each lookup reads a shared Zcash node with a daily quota. Crawlers can index the <Link className="text-accent-text underline" href="/">overview</Link>, <Link className="text-accent-text underline" href="/dashboard">dashboard</Link> and <Link className="text-accent-text underline" href="/analytics">analytics</Link> pages; see robots.txt.</Notice>;
  const when = reason === "day" ? "tomorrow (00:00 UTC)" : Number.isFinite(secs) && secs > 0 ? `in ${secs} second${secs === 1 ? "" : "s"}` : "in a minute";
  return (
    <Notice tone="warn" title="You're looking things up very quickly">
      Each lookup is read live from a shared Zcash node with a daily quota, so we allow about 20 lookups a minute and 200 a day per visitor. Try again {when}. The <Link className="text-accent-text underline" href="/dashboard">dashboard</Link> and <Link className="text-accent-text underline" href="/analytics">analytics</Link> aren&apos;t limited.
    </Notice>
  );
}
