import { cn } from "@/lib/utils";
import type { SyncState } from "@/lib/types";

const MAP: Record<SyncState, { label: string; dot: string; text: string }> = {
  synced: { label: "Synced", dot: "bg-accent", text: "text-accent-text" },
  lagging: { label: "Lagging", dot: "bg-warn", text: "text-warn" },
  unreachable: { label: "Node unreachable", dot: "bg-danger", text: "text-danger" },
};
export function StatusPill({ state }: { state: SyncState }) {
  const m = MAP[state];
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium", m.text)}>
      <span aria-hidden className={cn("h-2 w-2 rounded-full", m.dot, state === "synced" && "motion-safe:animate-pulse")} />{m.label}
    </span>
  );
}
