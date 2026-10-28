import Link from "next/link";
import { Notice } from "@/components/ui";
export default function NF() { return <Notice tone="warn" title="Block not found">That height is above the current chain tip, or no block has that hash. <Link className="text-accent-text underline" href="/search">Search again</Link>.</Notice>; }
