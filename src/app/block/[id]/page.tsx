import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Field, PageTitle, Raw } from "@/components/ui";
import { HashValue } from "@/components/copy";
import { heightOrHashSchema } from "@/lib/detect";
import { getBlockDetail } from "@/lib/service";
import { fmtBytes, fmtInt, fmtUtc, fmtZec, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = heightOrHashSchema.safeParse(id);
  if (!v.success) notFound(); // malformed ids get a 400 from middleware before reaching here
  const b = await getBlockDetail(String(v.data)).catch(() => undefined);
  if (b === undefined) throw new Error("node_unreachable"); // real error status (not 200); error.tsx explains
  if (!b) notFound();
  return (
    <div>
      <PageTitle eyebrow="Block" title={<span className="num">#{b.height.toLocaleString()}</span>}>
        <nav aria-label="Adjacent blocks" className="mt-2 flex gap-3 text-sm">
          {b.previousHash && <Link className="text-accent-text hover:underline" href={`/block/${b.height - 1}`}>← {fmtInt(b.height - 1)}</Link>}
          {(b.nextHash || (b.confirmations ?? 0) > 1) && <Link className="text-accent-text hover:underline" href={`/block/${b.height + 1}`}>{fmtInt(b.height + 1)} →</Link>}
        </nav>
      </PageTitle>
      <Card>
        <dl>
          <Field label="Hash"><HashValue value={b.hash} label="block hash" /></Field>
          <Field label="Time">{fmtUtc(b.time)} <span className="font-sans text-muted">({timeAgo(b.time)})</span></Field>
          <Field label="Transactions">{b.txCount}</Field>
          <Field label="Size">{fmtBytes(b.size)}</Field>
          <Field label="Confirmations">{fmtInt(b.confirmations)}</Field>
          <Field label="Difficulty">{b.difficulty === null ? "not reported" : fmtInt(Math.round(b.difficulty))}</Field>
          {b.previousHash && <Field label="Previous"><HashValue value={b.previousHash} label="previous hash" href={`/block/${b.previousHash}`} /></Field>}
        </dl>
      </Card>
      <h2 className="mb-2 mt-6 font-semibold">Transactions ({b.txCount})</h2>
      <Card className="p-0">
        <ul className="divide-y divide-border">
          {b.txs.map((t) => (
            <li key={t.txid} className="px-4 py-3">
              <HashValue value={t.txid} label="txid" href={`/tx/${t.txid}`} />
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                {t.coinbase && <span className="rounded bg-accent/15 px-1.5 text-accent-text">coinbase</span>}
                <span>{t.transparentInputs} in · {t.transparentOutputs} out</span>
                <span className="num">{fmtZec(t.transparentOutputTotal, 4)} transparent out</span>
                {t.shieldedComponents > 0 && <span>{t.shieldedComponents} shielded components (amounts private)</span>}
              </p>
            </li>
          ))}
        </ul>
      </Card>
      <Raw data={b} label="Raw block" />
    </div>
  );
}
