export const NR = "not reported";
export const fmtInt = (n: number | null | undefined) => (n == null ? NR : n.toLocaleString("en-US"));
export const fmtZec = (n: number | null | undefined, dp = 2) => (n == null ? NR : `${n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })} ZEC`);
export const fmtZecExact = (n: number | null | undefined) => (n == null ? NR : `${n.toLocaleString("en-US", { minimumFractionDigits: 8, maximumFractionDigits: 8 })} ZEC`);
export function fmtHashrate(sol: number | null | undefined): { value: string; unit: string } {
  if (sol == null) return { value: NR, unit: "" };
  const units = ["Sol/s", "KSol/s", "MSol/s", "GSol/s", "TSol/s"];
  let i = 0; let v = sol;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return { value: v.toFixed(2), unit: units[i] };
}
export function timeAgo(unixSec: number | null | undefined, nowMs = Date.now()): string {
  if (unixSec == null) return NR;
  const s = Math.max(0, Math.round(nowMs / 1000 - unixSec));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export const fmtUtc = (unixSec: number | null | undefined) => (unixSec == null ? NR : new Date(unixSec * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC");
export const fmtBytes = (n: number | null | undefined) => (n == null ? NR : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
export const shortHash = (h: string, n = 8) => (h.length <= n * 2 + 1 ? h : `${h.slice(0, n)}…${h.slice(-n)}`);
