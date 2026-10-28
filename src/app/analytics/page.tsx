import { Suspense } from "react";
import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { PoolSection, PoolSkeleton, StatusSection, StatusSkeleton } from "@/components/dash/sections";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default function Analytics() {
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <PageTitle eyebrow="Analytics" title="Network status and pool history"><p className="mt-1 text-sm text-muted">Read straight from the node: getblockchaininfo, getnetworksolps and per-block valuePools.</p></PageTitle>
      <section id="network" aria-labelledby="network-h" className="scroll-mt-24">
        <h2 id="network-h" className="sr-only">Network status</h2>
        <Suspense fallback={<StatusSkeleton />}><StatusSection /></Suspense>
      </section>
      <Card className="min-w-0 scroll-mt-24" >
        <section id="pools" aria-labelledby="pools-h" className="scroll-mt-24">
          <h2 id="pools-h" className="mb-1 font-semibold">Pool history</h2>
          <p className="mb-3 text-xs text-muted">ZEC held in each value pool, one snapshot per UTC day.</p>
          <Suspense fallback={<PoolSkeleton />}><PoolSection /></Suspense>
        </section>
      </Card>
    </div>
  );
}
