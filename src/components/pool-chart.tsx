"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import type { PoolPoint, PoolRange } from "@/lib/types";
import { fmtZecExact } from "@/lib/format";
import { cn } from "@/lib/utils";

const SERIES = [
  { key: "orchard", label: "Orchard (shielded)", color: "#3EE08F" },
  { key: "sapling", label: "Sapling (shielded)", color: "#4FA3FF" },
  { key: "sprout", label: "Sprout (shielded)", color: "#B58CFF" },
  { key: "transparent", label: "Transparent", color: "#8FA39A" },
  { key: "lockbox", label: "Lockbox", color: "#E0B84A" },
  { key: "ironwood", label: "Ironwood", color: "#FF8FB1" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];
type View = "stacked" | "per";

const axisFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 5 });
const fmtAxis = (v: number) => axisFmt.format(v);

function MiniTip({ active, payload, label, name }: TooltipContentProps<number, string> & { name: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as PoolPoint;
  const v = payload[0]?.value;
  return (
    <div className="rounded-lg border border-border bg-surface p-2 text-xs shadow-lg">
      <p className="font-medium">{label} <span className="num text-muted">· block {p.height.toLocaleString()}</span></p>
      <p>{name}: <span className="num">{fmtZecExact(typeof v === "number" ? v : null)}</span></p>
    </div>
  );
}

function SmallMultiples({ data, reduced }: { data: PoolPoint[]; reduced: boolean }) {
  const series = SERIES.filter((s) => data.some((d) => d[s.key] !== null));
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {series.map((s) => {
        const vals = data.map((d) => d[s.key]).filter((v): v is number => v !== null);
        const first = vals[0]; const last = vals[vals.length - 1];
        const delta = first !== undefined && last !== undefined ? last - first : null;
        return (
          <li key={s.key} className="rounded-lg border border-border p-3">
            <p className="flex items-center gap-1.5 text-xs text-muted"><i aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</p>
            <p className="num mt-0.5 text-lg font-semibold">{fmtZecExact(last ?? null).replace(/(\.\d{2})\d+/, "$1")}</p>
            <p className="num text-xs text-muted">{delta === null ? "change not reported" : `${delta >= 0 ? "+" : ""}${delta.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ZEC over range`}</p>
            <div className="mt-2 h-24" role="img" aria-label={`${s.label} over the selected range; own y-axis scale.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis width={48} domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "var(--muted)" }} tickFormatter={fmtAxis} tickCount={3} />
                  <Tooltip content={(p) => <MiniTip {...(p as TooltipContentProps<number, string>)} name={s.label} />} />
                  <Line type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={!reduced} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TipBox({ active, payload, label }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as PoolPoint;
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-xs shadow-lg">
      <p className="mb-1 font-medium">{label} <span className="num text-muted">· block {p.height.toLocaleString()}</span></p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex justify-between gap-4"><span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span><span className="num">{fmtZecExact(p[s.key])}</span></p>
      ))}
    </div>
  );
}

export function PoolChart({ points, updatedAt, source }: { points: PoolPoint[]; updatedAt: number | null; source: string }) {
  const [range, setRange] = useState<PoolRange>("30d");
  const [table, setTable] = useState(false);
  const [view, setView] = useState<View>("per");
  const [reduced, setReduced] = useState(false);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set(["transparent", "lockbox"]));
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  const data = useMemo(() => (range === "all" ? points : points.slice(-(range === "7d" ? 7 : 30))), [points, range]);
  const shown = SERIES.filter((s) => !hidden.has(s.key) && data.some((d) => d[s.key] !== null));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Range" className="inline-flex rounded-lg border border-border p-0.5">
          {(["7d", "30d", "all"] as const).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
              className={cn("min-h-9 rounded-md px-3 text-sm", range === r ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>{r === "all" ? "All" : r.toUpperCase()}</button>
          ))}
        </div>
        <div role="group" aria-label="Chart layout" className="inline-flex rounded-lg border border-border p-0.5">
          {([["per", "Per pool"], ["stacked", "Stacked"]] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={view === v} disabled={table} onClick={() => setView(v)}
              className={cn("min-h-9 rounded-md px-3 text-sm disabled:opacity-50", view === v ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}>{l}</button>
          ))}
        </div>
        <button type="button" aria-pressed={table} onClick={() => setTable((t) => !t)} className="ml-auto min-h-9 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">{table ? "View as chart" : "View as table"}</button>
      </div>
      <div className={cn("mb-3 flex flex-wrap gap-x-3 gap-y-1", (view === "per" || table) && "hidden")}>
        {SERIES.map((s) => (
          <label key={s.key} className="flex cursor-pointer items-center gap-1.5 text-xs">
            <input type="checkbox" className="accent-[#3EE08F]" checked={!hidden.has(s.key)} onChange={() => setHidden((h) => { const n = new Set(h); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })} />
            <i aria-hidden className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}
          </label>
        ))}
      </div>
      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted">No pool snapshots yet. Run <code className="num mx-1">pnpm ingest</code> to record the first one.</div>
      ) : table ? (
        <div className="h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Daily pool values in ZEC</caption>
            <thead className="sticky top-0 bg-surface-2"><tr><th className="p-2">Date (UTC)</th>{SERIES.map((s) => <th key={s.key} className="p-2 text-right">{s.label}</th>)}</tr></thead>
            <tbody>{[...data].reverse().map((d) => (<tr key={d.date} className="border-t border-border"><td className="num p-2">{d.date}</td>{SERIES.map((s) => <td key={s.key} className="num whitespace-nowrap p-2 text-right">{fmtZecExact(d[s.key])}</td>)}</tr>))}</tbody>
          </table>
        </div>
      ) : view === "per" ? (
        <SmallMultiples data={data} reduced={reduced} />
      ) : (
        <div className="h-64 w-full" role="img" aria-label={`Pool values over ${range}. Use "View as table" for exact numbers.`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
              <YAxis width={44} tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={(v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}k`)} />
              <Tooltip content={(p) => <TipBox {...(p as TooltipContentProps<number, string>)} />} />
              {shown.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} stackId="1" stroke={s.color} fill={s.color} fillOpacity={0.35} isAnimationActive={!reduced} connectNulls={false} />)}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 min-h-12 text-xs text-muted sm:min-h-8">Source: {source} · getblockchaininfo / getblock <span className="num">valuePools</span>, one snapshot per UTC day · Last updated: <span className="num">{updatedAt ? new Date(updatedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never"}</span></p>
    </div>
  );
}
