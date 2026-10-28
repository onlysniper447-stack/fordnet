const axisFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 5 });
export const fmtAxis = (v: number) => axisFmt.format(v);

/** Padded domain + ticks whose labels never repeat (flat or near-flat series used to show "419.94K" twice). */
export function axisFor(vals: number[]): { domain: [number, number]; ticks: number[] } {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.0005, 1e-8);
  const domain: [number, number] = [lo - pad, hi + pad];
  const ticks: number[] = [];
  for (const t of [domain[0], (domain[0] + domain[1]) / 2, domain[1]]) if (!ticks.some((x) => fmtAxis(x) === fmtAxis(t))) ticks.push(t);
  return { domain, ticks };
}
