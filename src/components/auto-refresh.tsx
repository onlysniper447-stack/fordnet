"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
export function AutoRefresh({ ms = 30_000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, ms); return () => clearInterval(t); }, [router, ms]);
  return null;
}
