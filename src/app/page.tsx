import { Suspense } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { BlocksSection, BlocksSkeleton, PoolSection, PoolSkeleton, StatusSection, StatusSkeleton } from "@/components/dash/sections";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <AutoRefresh />
      <div>
        <h1 className="sr-only">Zcash network dashboard</h1>
        <Suspense fallback={<StatusSkeleton />}><StatusSection /></Suspense>
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-sm text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" />
        Fordnet reports only public protocol data. Shielded amounts and parties are not inferred.
      </p>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <h2 className="mb-1 font-semibold">Pool value</h2>
          <p className="mb-3 text-xs text-muted">Total ZEC held in each value pool, per UTC day.</p>
          <Suspense fallback={<PoolSkeleton />}><PoolSection /></Suspense>
        </Card>
        <Card className="min-w-0 lg:col-span-2">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold">Recent blocks</h2><Link href="/developers" className="text-xs text-accent-text hover:underline">Get via API →</Link></div>
          <Suspense fallback={<BlocksSkeleton />}><BlocksSection /></Suspense>
        </Card>
      </div>
    </div>
  );
}
