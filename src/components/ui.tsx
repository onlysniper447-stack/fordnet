import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-xl border border-border bg-surface p-4", className)}>{children}</section>;
}
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}
export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 min-w-0">
      {eyebrow && <p className="text-xs font-medium uppercase tracking-wider text-muted">{eyebrow}</p>}
      <h1 className="text-xl font-semibold sm:text-2xl break-all">{title}</h1>
      {children}
    </div>
  );
}
export function Field({ label, children, mono = true }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-border py-2.5 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-sm text-muted sm:w-40">{label}</dt>
      <dd className={cn("min-w-0 break-all text-sm", mono && "num")}>{children}</dd>
    </div>
  );
}
export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error"; title: string; children?: ReactNode }) {
  const t = { info: "border-border bg-surface-2", warn: "border-warn/50 bg-warn/10", error: "border-danger/50 bg-danger/10" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "note"} className={cn("rounded-lg border p-3 text-sm", t)}>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-muted">{children}</div>}
    </div>
  );
}
export function Raw({ data, label = "Raw data" }: { data: unknown; label?: string }) {
  return (
    <details className="mt-4 rounded-lg border border-border bg-surface">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">{label} (JSON)</summary>
      <pre className="num max-h-96 overflow-auto border-t border-border p-4 text-xs">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}
export const buttonCls = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50";
export const btnPrimary = cn(buttonCls, "bg-accent text-accent-fg hover:brightness-95");
export const btnGhost = cn(buttonCls, "border border-border bg-surface hover:bg-surface-2");
