import Link from "next/link";
import { Card, Notice, PageTitle, Raw } from "@/components/ui";
import { HashValue } from "@/components/copy";
import { taddrSchema } from "@/lib/detect";
import { getAddressInfo } from "@/lib/service";
import { fmtZec, fmtZecExact } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AddressPage({ params }: { params: Promise<{ taddr: string }> }) {
  const { taddr } = await params;
  const v = taddrSchema.safeParse(taddr);
  if (!v.success) return <Notice tone="error" title="Invalid transparent address">{v.error.issues[0]?.message}</Notice>;
  const a = await getAddressInfo(v.data).catch(() => null);
  if (!a) return <Notice tone="error" title="Node unreachable">Couldn&apos;t reach the Zcash node. Try again shortly.</Notice>;
  return (
    <div>
      <PageTitle eyebrow={v.data.startsWith("t3") ? "Transparent address (P2SH)" : "Transparent address (P2PKH)"} title={<HashValue value={a.address} label="address" />} />
      <div className="mb-4"><Notice title="Shielded activity is not visible">This page shows transparent activity only. Funds moved into Sapling or Orchard pools are private by design.</Notice></div>
      {!a.indexAvailable && <div className="mb-4"><Notice tone="warn" title="Address index not reported">The connected node doesn&apos;t expose address RPCs (zcashd needs <code className="num">-insightexplorer</code>). Balance and history are unavailable.</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card><p className="text-sm text-muted">Transparent balance</p><p className={a.balanceZec === null ? "mt-1 text-lg text-muted" : "num mt-1 text-2xl font-semibold sm:text-3xl"}>{fmtZec(a.balanceZec, 4)}</p><p className="num mt-1 text-xs text-muted">{a.balanceZec !== null && fmtZecExact(a.balanceZec)}</p></Card>
        <Card><p className="text-sm text-muted">Total received (transparent)</p><p className={a.receivedZec === null ? "mt-1 text-lg text-muted" : "num mt-1 text-2xl font-semibold sm:text-3xl"}>{fmtZec(a.receivedZec, 4)}</p></Card>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Recent transactions</h2>
      <Card className="p-0">
        {a.txs === null ? <p className="p-4 text-sm text-muted">Not reported by this node.</p> : a.txs.length === 0 ? <p className="p-4 text-sm text-muted">No transparent transactions for this address.</p> : (
          <ul className="divide-y divide-border">{a.txs.map((t) => (
            <li key={t.txid + t.height} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><HashValue value={t.txid} label="txid" href={`/tx/${t.txid}`} /><p className="text-xs text-muted">block <Link className="num text-accent-text hover:underline" href={`/block/${t.height}`}>{t.height.toLocaleString()}</Link></p></div>
              <p className={`num shrink-0 text-sm ${t.deltaZec >= 0 ? "text-accent-text" : "text-danger"}`}>{t.deltaZec >= 0 ? "+" : ""}{t.deltaZec.toFixed(4)}</p>
            </li>))}</ul>)}
      </Card>
      <Raw data={a} label="Raw address data" />
    </div>
  );
}
