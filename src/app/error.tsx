"use client";
import { Notice, btnGhost } from "@/components/ui";
export default function Err({ reset }: { error: Error; reset: () => void }) {
  return <div className="space-y-3"><Notice tone="error" title="Zcash node temporarily unavailable">We couldn&apos;t reach the node for this lookup (or today&apos;s shared lookup budget is used up) and have no cached copy. Nothing is wrong with your input — try again in a minute.</Notice><button className={btnGhost} onClick={reset}>Try again</button></div>;
}
