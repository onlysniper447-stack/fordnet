import Link from "next/link";
import { Card, Notice, Raw, Skeleton } from "@/components/ui";
import { StatusPill } from "@/components/status";
import { HashValue } from "@/components/copy";
import { PoolChart } from "@/components/pool-chart";
import { getNetworkStatus, getPoolHistory, getRecentBlocks } from "@/lib/service";
import { fmtHashrate, fmtInt, fmtUtc, shortHash, timeAgo, fmtBytes, NR } from "@/lib/format";
import { isMocked } from "@/lib/rpc";

function Stat({ label, value, unit, detail }: { label: string; value: string; unit?: string; detail: React.ReactNode }) {
  const nr = value === NR;
  return (
    <Card className="flex h-[126px] min-w-0 flex-col sm:h-[116px]">
      <p className="text-sm text-muted">{label}</p>
      <p className={nr ? "mt-1 text-lg text-muted" : "num mt-1 truncate text-2xl font-semibold sm:text-3xl"}>{value}{unit && !nr && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}</p>
      <div className="mt-auto pt-1 text-xs text-muted">{detail}</div>
    </Card>
  );
}

export async function StatusSection() {
  const s = await getNetworkStatus();
  const hr = fmtHashrate(s.hashrateSolPerSec);
  return (
    <>
      <div className="mb-4">
        <div className="flex h-8 min-w-0 items-center gap-3">
          <StatusPill state={s.state} />
          {s.state === "lagging" && s.live && <span className="truncate text-xs text-warn">No block for 5+ min — usually normal variance</span>}
        </div>
        <p className="mt-1 h-4 truncate text-xs text-muted">{s.mocked ? "Source: MOCKED RPC" : `Source: Zcash node (${s.chain ?? "chain " + NR})`} · updated <span className="num">{s.snapshotAt ? new Date(s.snapshotAt).toISOString().slice(11, 19) + " UTC" : NR}</span></p>
      </div>
      {!s.live && (
        <div className="mb-4">
          <Notice tone={s.degraded?.reason === "unreachable" || !s.degraded ? "error" : "warn"} title={s.degraded?.reason === "rate_limited" ? "Node provider is rate-limiting us — showing stored data" : s.degraded?.reason === "provider_error" ? "Node provider is returning errors (HTTP 503) — showing stored data" : s.snapshotAt ? "Node unreachable — showing last snapshot" : "Node unreachable and no snapshot yet"}>
            {s.snapshotAt ? <>Data below is from <span className="num">{new Date(s.snapshotAt).toISOString().replace("T", " ").slice(0, 19)} UTC</span>.{s.degraded?.retryAt ? <> Next attempt after <span className="num">{new Date(s.degraded.retryAt).toISOString().slice(11, 19)} UTC</span>; the page refreshes on its own.</> : " It refreshes automatically when the node responds."}</> : <>Check ZCASH_RPC_URL, then run <code className="num">pnpm ingest</code>.</>}
          </Notice>
        </div>
      )}
      {/* lag explanation is inline with the pill (no extra block => no layout shift) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Block height" value={fmtInt(s.height)} detail={s.headers !== null ? <>headers <span className="num">{fmtInt(s.headers)}</span></> : "headers not reported"} />
        <Stat label="Network hashrate" value={hr.value} unit={hr.unit} detail={s.difficulty !== null ? <>difficulty <span className="num">{fmtInt(Math.round(s.difficulty))}</span></> : "difficulty not reported"} />
        <Stat label="Last block" value={s.lastBlockTime === null ? NR : timeAgo(s.lastBlockTime, s.snapshotAt ?? Date.now()).replace(" ago", "")} unit="ago" detail={<span className="num">{fmtUtc(s.lastBlockTime)}</span>} />
        <Stat label="Txs in last block" value={fmtInt(s.lastBlockTxCount)} detail={s.bestBlockHash ? <Link className="num text-accent-text hover:underline" href={`/block/${s.bestBlockHash}`}>{shortHash(s.bestBlockHash, 6)}</Link> : NR} />
      </div>
      <Raw data={s} label="Raw network status" />
    </>
  );
}
export function StatusSkeleton() {
  return (
    <>
      <div className="mb-4"><Skeleton className="h-8 w-28 rounded-full" /><Skeleton className="mt-1 h-4 w-56" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[126px] rounded-xl sm:h-[116px]" />)}</div>
      <Skeleton className="mt-4 h-[46px] rounded-lg" />
    </>
  );
}

export async function BlocksSection() {
  const blocks = await getRecentBlocks(10);
  if (blocks.length === 0) return <Notice title="No blocks stored yet">Run <code className="num">pnpm ingest</code> (or wait for the scheduled ingest) to load the last 100 blocks.</Notice>;
  return (
    <ul className="divide-y divide-border">
      {blocks.map((b) => (
        <li key={b.height} className="flex min-h-[60px] items-center gap-3 py-2">
          <Link href={`/block/${b.height}`} className="num w-24 shrink-0 font-medium text-accent-text hover:underline">{b.height.toLocaleString()}</Link>
          <div className="min-w-0 flex-1">
            <HashValue value={b.hash} label="block hash" display={shortHash(b.hash, 8)} />
            <p className="text-xs text-muted">{timeAgo(b.time)} · {fmtBytes(b.size)}</p>
          </div>
          <p className="num shrink-0 text-right text-sm">{b.txCount}<span className="block text-xs font-sans text-muted">txs</span></p>
        </li>
      ))}
    </ul>
  );
}
export function BlocksSkeleton() {
  return <ul aria-busy="true" className="divide-y divide-border">{Array.from({ length: 10 }, (_, i) => <li key={i} className="flex h-[81px] items-center py-2 last:h-[80px] sm:h-[60px] sm:last:h-[60px]"><Skeleton className="h-full w-full" /></li>)}</ul>;
}

export async function PoolSection() {
  const { points, updatedAt } = await getPoolHistory("all");
  return <PoolChart points={points} updatedAt={updatedAt} source={isMocked() ? "MOCKED RPC" : "Zcash node"} />;
}
export function PoolSkeleton() {
  // Mirrors the default "Per pool" layout exactly (measured: tiles 192px, controls 86/42px) so nothing shifts on load.
  return (
    <div aria-busy="true" aria-label="Loading pool history">
      <Skeleton className="mb-3 h-[86px] w-full sm:h-[42px]" />
      <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[192px] rounded-lg" />)}</div>
      <Skeleton className="mt-2 h-12 w-full sm:h-8" />
    </div>
  );
}
