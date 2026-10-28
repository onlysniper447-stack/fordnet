import Link from "next/link";
import { Notice } from "@/components/ui";
export default function NF() { return <Notice tone="warn" title="Address not found">Transparent addresses start with t1 or t3 and are 35 characters. <Link className="text-accent-text underline" href="/search">Search again</Link>.</Notice>; }
