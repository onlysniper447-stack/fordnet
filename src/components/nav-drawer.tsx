"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem { href: string; label: string; hint: string }
const SECTIONS: { title: string; items: NavItem[] }[] = [
  { title: "Tools", items: [
    { href: "/search", label: "Search & lookup", hint: "Block height, block hash, txid or t1/t3 address" },
  ] },
  { title: "Analytics", items: [
    { href: "/analytics", label: "Network status", hint: "Sync state, height, hashrate, difficulty" },
    { href: "/analytics#pools", label: "Pool history", hint: "Daily ZEC in each value pool" },
  ] },
  { title: "API", items: [
    { href: "/developers", label: "Quick start", hint: "Three steps to your first request" },
    { href: "/developers#key", label: "Get an API key", hint: "Free, 200 requests a day" },
    { href: "/developers#ref", label: "Endpoint reference", hint: "Six read-only v1 endpoints" },
  ] },
  { title: "Products", items: [
    { href: "/", label: "Overview", hint: "What Fordnet does and how it works" },
    { href: "/dashboard", label: "Explorer dashboard", hint: "Live status, recent blocks, pool chart" },
    { href: "/developers", label: "Developer API", hint: "The same data as JSON over REST" },
  ] },
];

export function NavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const close = useCallback(() => { setOpen(false); btn.current?.focus(); }, []);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const f = [...panel.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")];
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [open, close]);

  const isActive = (href: string) => !href.includes("#") && (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <button ref={btn} type="button" aria-label="Open menu" aria-expanded={open} aria-controls="nav-drawer" onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface hover:bg-surface-2">
        <Menu aria-hidden className="h-5 w-5" />
      </button>
      {/* Portal: the sticky header uses backdrop-filter, which would otherwise trap position:fixed children. */}
      {mounted && createPortal(<>
      <div className={cn("fixed inset-0 z-40 bg-black/60 transition-opacity motion-reduce:transition-none", open ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden onClick={close} />
      <div ref={panel} id="nav-drawer" role="dialog" aria-modal="true" aria-label="Site menu" inert={!open}
        className={cn("fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-border bg-bg shadow-2xl transition-transform duration-200 motion-reduce:transition-none", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="flex items-center gap-2 font-semibold"><span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-accent" />Fordnet</span>
          <button type="button" aria-label="Close menu" onClick={close} className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-2"><X aria-hidden className="h-5 w-5" /></button>
        </div>
        <nav aria-label="Site" className="flex-1 overflow-y-auto px-2 py-3">
          {SECTIONS.map((s) => (
            <section key={s.title} className="mb-4">
              <h2 className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted">{s.title}</h2>
              <ul>
                {s.items.map((i) => {
                  const active = isActive(i.href);
                  return (
                    <li key={i.href + i.label}>
                      <Link href={i.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                        className={cn("block rounded-lg border-l-2 px-3 py-2", active ? "border-accent bg-surface-2" : "border-transparent hover:bg-surface")}>
                        <span className={cn("block text-sm font-medium", active && "text-accent-text")}>{i.label}</span>
                        <span className="block text-xs text-muted">{i.hint}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
        <p className="border-t border-border px-4 py-3 text-xs text-muted">Public Zcash protocol data only. Shielded amounts and parties are never inferred.</p>
      </div>
      </>, document.body)}
    </>
  );
}
