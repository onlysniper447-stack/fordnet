import { getNetworkStatus } from "@/lib/service";
import { fmtHashrate, fmtInt, fmtUtc, fmtZec, NR, timeAgo } from "@/lib/format";
import { StatusPill } from "@/components/status";
import { Skeleton } from "@/components/ui";
import { CodeBlock } from "@/components/code";

const updated = (ms: number | null) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC" : NR);

export async function LiveStrip() {
  const s = await getNetworkStatus();
  const hr = fmtHashrate(s.hashrateSolPerSec);
  const cells = [
    { label: "Block height", value: fmtInt(s.height), sub: s.headers !== null ? `headers ${fmtInt(s.headers)}` : "headers not reported" },
    { label: "Network hashrate", value: hr.value === NR ? NR : `${hr.value} ${hr.unit}`, sub: "getnetworksolps" },
    { label: "Last block", value: s.lastBlockTime === null ? NR : timeAgo(s.lastBlockTime, s.snapshotAt ?? Date.now()), sub: s.lastBlockTime === null ? NR : fmtUtc(s.lastBlockTime).slice(11) },
    { label: "Orchard pool", value: fmtZec(s.pools.orchard, 0), sub: `Sapling ${fmtZec(s.pools.sapling, 0)}` },
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4" style={{ gap: 1 }}>
        {cells.map((c) => (
          <div key={c.label} className="flex h-[92px] min-w-0 flex-col justify-center bg-surface px-4">
            <dt className="text-xs text-muted">{c.label}</dt>
            <dd className={c.value === NR ? "mt-1 text-base text-muted" : "num mt-1 truncate text-lg font-semibold sm:text-xl"}>{c.value}</dd>
            <dd className="num truncate text-xs text-muted">{c.sub}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex h-6 items-center gap-2 text-xs text-muted">
        <StatusPill state={s.state} />
        <span className="truncate">{s.mocked ? "MOCKED RPC" : "Mainnet node via JSON-RPC"} · updated <span className="num">{s.snapshotAt ? new Date(s.snapshotAt).toISOString().slice(11, 19) + " UTC" : NR}</span></span>
      </div>
    </div>
  );
}
export function LiveStripSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading live network data">
      <Skeleton className="h-[185px] rounded-xl lg:h-[92px]" />
      <Skeleton className="mt-2 h-6 w-64" />
    </div>
  );
}

export async function LiveResponse({ host }: { host: string }) {
  const s = await getNetworkStatus();
  const body = {
    data: { state: s.state, chain: s.chain, height: s.height, bestBlockHash: s.bestBlockHash, hashrateSolPerSec: s.hashrateSolPerSec, lastBlockTime: s.lastBlockTime, pools: { orchard: s.pools.orchard, sapling: s.pools.sapling } },
    meta: { mocked: s.mocked, source: s.mocked ? "MOCKED Zcash RPC" : "Zcash node JSON-RPC" },
    error: null,
  };
  return (
    <div className="grid min-w-0 gap-3">
      <CodeBlock label="curl command" code={`curl -s -H "x-api-key: $FORDNET_KEY" \\\n  https://${host}/api/v1/network/status`} />
      <div className="min-w-0 rounded-lg border border-border bg-bg">
        <p className="border-b border-border px-3 py-2 text-xs text-muted">Response · live from this deployment, truncated · <span className="num">{updated(s.snapshotAt)}</span></p>
        <pre className="num h-[280px] overflow-auto whitespace-pre-wrap break-all p-3 text-xs leading-relaxed">{JSON.stringify(body, null, 2)}</pre>
      </div>
    </div>
  );
}
export function LiveResponseSkeleton() {
  return <div className="grid gap-3"><Skeleton className="h-[64px] rounded-lg" /><Skeleton className="h-[315px] rounded-lg" /></div>;
}
