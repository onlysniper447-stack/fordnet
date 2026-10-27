"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CopyButton({ value, label = "value", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true); toast.success(`Copied ${label}`); setTimeout(() => setDone(false), 1500);
        } catch { toast.error("Clipboard unavailable — select and copy manually"); }
      }}
    >
      {done ? <Check className="h-4 w-4 text-accent-text" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

/** Monospace value that wraps safely at 380px, with a copy button. */
export function HashValue({ value, label, href, display }: { value: string; label: string; href?: string; display?: string }) {
  return (
    <span className="flex min-w-0 items-start gap-1">
      {href ? <a href={href} className="num min-w-0 break-all text-accent-text underline-offset-2 hover:underline">{display ?? value}</a> : <span className="num min-w-0 break-all" title={display ? value : undefined}>{display ?? value}</span>}
      <CopyButton value={value} label={label} className="-mt-1.5" />
    </span>
  );
}
