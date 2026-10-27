"use client";
import { Notice, btnGhost } from "@/components/ui";
export default function Err({ reset }: { error: Error; reset: () => void }) {
  return <div className="space-y-3"><Notice tone="error" title="Something went wrong loading this page">The node or database may be temporarily unavailable.</Notice><button className={btnGhost} onClick={reset}>Try again</button></div>;
}
