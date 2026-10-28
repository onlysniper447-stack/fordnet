"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Moon, Search, Sun } from "lucide-react";
import { NavDrawer } from "./nav-drawer";

export function SearchBox({ autoFocusMobile = false, initial = "", id = "header-search" }: { autoFocusMobile?: boolean; initial?: string; id?: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial);
  useEffect(() => {
    if (autoFocusMobile && window.matchMedia("(max-width: 767px)").matches) ref.current?.focus();
  }, [autoFocusMobile]);
  return (
    <form role="search" className="relative w-full" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
      <label htmlFor={id} className="sr-only">Search by block height, block hash, txid or t-address</label>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        ref={ref} id={id} data-search-input={id === "header-search" ? "" : undefined} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Height, hash, txid or t-address" autoComplete="off" spellCheck={false} enterKeyHint="search"
        className="num h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-10 text-sm placeholder:font-sans placeholder:text-muted"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-xs text-muted md:block">/</kbd>
    </form>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <button type="button" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface hover:bg-surface-2"
      onClick={() => { const n = !dark; setDark(n); document.documentElement.classList.toggle("dark", n); localStorage.setItem("theme", n ? "dark" : "light"); }}>
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function Header() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)))) return;
      e.preventDefault();
      document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">Skip to content</a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:flex-nowrap">
        <NavDrawer />
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-accent" />Fordnet
        </Link>
        <nav aria-label="Primary" className="ml-auto flex items-center gap-1 text-sm md:order-3 md:ml-0">
          <Link href="/developers" className="rounded-md px-2 py-2 text-muted hover:text-fg">API</Link>
          <ThemeToggle />
        </nav>
        <div className="order-last w-full md:order-2 md:ml-auto md:max-w-md"><SearchBox /></div>
      </div>
    </header>
  );
}
