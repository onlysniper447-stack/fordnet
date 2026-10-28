import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/ui";
export const metadata: Metadata = { title: "Invalid input", robots: { index: false } };
const MSG: Record<string, { title: string; body: string }> = {
  block: { title: "That isn't a block height or hash", body: "Use a whole number (e.g. 2500000) or a 64-character hex block hash." },
  tx: { title: "That isn't a valid txid", body: "A txid is exactly 64 hexadecimal characters (0-9, a-f)." },
  address: { title: "That isn't a transparent address", body: "Transparent addresses start with t1 or t3 and are 35 base58 characters. Shielded addresses can't be looked up by design." },
};
export default async function Invalid({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const m = MSG[(await searchParams).kind ?? ""] ?? { title: "Invalid input", body: "Check the value and try again." };
  return <Notice tone="error" title={m.title}>{m.body} <Link className="text-accent-text underline" href="/search">Go to search</Link>.</Notice>;
}
