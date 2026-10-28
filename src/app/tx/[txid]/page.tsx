import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Field, Notice, PageTitle, Raw } from "@/components/ui";
import { HashValue } from "@/components/copy";
import { hex64Schema } from "@/lib/detect";
import { getTxDetail } from "@/lib/service";
import { fmtBytes, fmtInt, fmtUtc, fmtZecExact } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TxPage({ params }: { params: Promise<{ txid: string }> }) {
  const { txid } = await params;
  const v = hex64Schema.safeParse(txid);
  if (!v.success) notFound();
  const t = await getTxDetail(v.data).catch(() => undefined);
  if (t === undefined) return <Notice tone="error" title="Node unreachable">Couldn&apos;t reach the Zcash node. Try again shortly.</Notice>;
  if (!t) notFound();
  const sh = t.shielded;
  const shieldedTotal = sh.saplingSpends + sh.saplingOutputs + sh.orchardActions + sh.sproutJoinSplits;
  return (
    <div>
      <PageTitle eyebrow={t.coinbase ? "Coinbase transaction" : "Transaction"} title={<span className="num text-base sm:text-xl">{t.txid}</span>} />
      <Card>
        <dl>
          <Field label="Txid"><HashValue value={t.txid} label="txid" /></Field>
          <Field label="Block">{t.height !== null && t.blockHash ? <Link className="text-accent-text hover:underline" href={`/block/${t.blockHash}`}>#{t.height.toLocaleString()}</Link> : "unconfirmed / not reported"}</Field>
          <Field label="Time">{fmtUtc(t.time)}</Field>
          <Field label="Confirmations">{fmtInt(t.confirmations)}</Field>
          <Field label="Size">{fmtBytes(t.size)}</Field>
          <Field label="Version">{t.version ?? "not reported"}</Field>
        </dl>
      </Card>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Transparent inputs ({t.inputs.length})</h2>
          <Card className="p-0">{t.inputs.length === 0 ? <p className="p-4 text-sm text-muted">{t.coinbase ? "Newly minted coins (coinbase)." : "No transparent inputs."}</p> : (
            <ul className="divide-y divide-border">{t.inputs.map((i, k) => (
              <li key={k} className="space-y-1 px-4 py-3 text-sm">
                {i.address ? <HashValue value={i.address} label="address" href={`/address/${i.address}`} /> : <span className="text-muted">address not reported</span>}
                <p className="num text-xs text-muted">{i.value !== null ? fmtZecExact(i.value) : "value not reported"}{i.txid && <> · from <Link className="text-accent-text hover:underline" href={`/tx/${i.txid}`}>{i.txid.slice(0, 10)}…:{i.vout}</Link></>}</p>
              </li>))}</ul>)}
          </Card>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Transparent outputs ({t.outputs.length})</h2>
          <Card className="p-0">{t.outputs.length === 0 ? <p className="p-4 text-sm text-muted">No transparent outputs.</p> : (
            <ul className="divide-y divide-border">{t.outputs.map((o) => (
              <li key={o.n} className="space-y-1 px-4 py-3 text-sm">
                {o.address ? <HashValue value={o.address} label="address" href={`/address/${o.address}`} /> : <span className="text-muted">no address ({o.type ?? "unknown script"})</span>}
                <p className="num text-xs text-muted">#{o.n} · {fmtZecExact(o.value)}</p>
              </li>))}</ul>)}
          </Card>
        </section>
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Shielded components</h2>
      <Card>
        <p className="num text-2xl font-semibold">{shieldedTotal}</p>
        <p className="mt-1 text-xs text-muted">Sapling spends {sh.saplingSpends} · Sapling outputs {sh.saplingOutputs} · Orchard actions {sh.orchardActions} · Sprout JoinSplits {sh.sproutJoinSplits}</p>
        <p className="mt-2 text-sm text-muted">Counts only. Shielded senders, recipients and amounts are encrypted and are not inferred.</p>
      </Card>
      <Raw data={t} label="Raw transaction (public fields)" />
    </div>
  );
}
