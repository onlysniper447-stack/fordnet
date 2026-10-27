import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SearchBox } from "@/components/header";
import { Notice, PageTitle } from "@/components/ui";
import { detectInput } from "@/lib/detect";
import { getBlockDetail, getTxDetail } from "@/lib/service";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q ?? "";
  const d = detectInput(q);
  let notFound: { title: string; body: string } | null = null;

  if (d.type === "height") {
    if (await getBlockDetail(String(d.value)).catch(() => null)) redirect(`/block/${d.value}`);
    notFound = { title: `Block ${d.value.toLocaleString()} not found`, body: "That height is above the current chain tip, or the node is unreachable." };
  } else if (d.type === "hex64") {
    const order = d.likely === "block" ? (["block", "tx"] as const) : (["tx", "block"] as const);
    for (const kind of order) {
      const hit = kind === "block" ? await getBlockDetail(d.value).catch(() => null) : await getTxDetail(d.value).catch(() => null);
      if (hit) redirect(kind === "block" ? `/block/${d.value}` : `/tx/${d.value}`);
    }
    notFound = { title: "No block or transaction with that hash", body: "We checked both block hashes and txids. Double-check the value, or the node may not have indexed it (zcashd needs -txindex for arbitrary txids)." };
  } else if (d.type === "taddr") {
    redirect(`/address/${d.value}`);
  } else if (d.type === "shielded") {
    notFound = { title: "Shielded addresses can't be looked up", body: "That looks like a shielded or unified address. Its balance and activity are private by design, and Fordnet never tries to infer them." };
  } else if (d.type === "unknown") {
    notFound = { title: "We couldn't recognise that input", body: d.reason };
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Search the Zcash chain" />
      <SearchBox autoFocusMobile initial={q} id="page-search" />
      <ul className="mt-3 grid grid-cols-1 gap-1 text-xs text-muted sm:grid-cols-2">
        <li><span className="num text-fg">2500000</span> — block height</li>
        <li><span className="num text-fg">0000…</span> — 64-hex block hash</li>
        <li><span className="num text-fg">a1b2…</span> — 64-hex txid</li>
        <li><span className="num text-fg">t1… / t3…</span> — transparent address</li>
      </ul>
      {notFound && <div className="mt-6"><Notice tone="warn" title={notFound.title}>{notFound.body}</Notice></div>}
    </div>
  );
}
