"use client";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "./copy";
import { btnPrimary } from "./ui";

export function KeyGenerator() {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function create() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: label || undefined }) });
      const j = (await r.json()) as { data: { key: string } | null; error: { message: string } | null };
      if (!r.ok || !j.data) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
      setKey(j.data.key); toast.success("API key created — copy it now");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed to create key"); } finally { setBusy(false); }
  }
  if (key) return (
    <div className="rounded-lg border border-accent/60 bg-accent/10 p-4">
      <p className="text-sm font-medium">Your API key (shown once — we only store a hash)</p>
      <div className="mt-2 flex items-center gap-1 rounded-md bg-surface p-2"><code className="num min-w-0 flex-1 break-all text-sm">{key}</code><CopyButton value={key} label="API key" /></div>
      <button type="button" className="mt-3 text-sm text-accent-text underline" onClick={() => { setKey(null); setLabel(""); }}>Create another key</button>
    </div>
  );
  return (
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void create(); }}>
      <label htmlFor="key-label" className="sr-only">Key label (optional)</label>
      <input id="key-label" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional), e.g. my-wallet-app" className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm placeholder:text-muted" />
      <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Creating…" : "Generate API key"}</button>
      {err && <p role="alert" className="text-sm text-danger sm:basis-full">{err}</p>}
    </form>
  );
}
