import Link from "next/link";
import { Notice } from "@/components/ui";
export default function NotFound() { return <Notice tone="warn" title="Page not found">Try the search bar, or go back to the <Link className="text-accent-text underline" href="/dashboard">dashboard</Link>.</Notice>; }
