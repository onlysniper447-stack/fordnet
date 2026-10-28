import Link from "next/link";
import { Notice } from "@/components/ui";
export default function NF() { return <Notice tone="warn" title="Transaction not found">The node has no transaction with that txid. Check for a typo, or it may still be unconfirmed. <Link className="text-accent-text underline" href="/search">Search again</Link>.</Notice>; }
