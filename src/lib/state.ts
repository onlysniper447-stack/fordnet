import type { Degraded, SyncState } from "./types";

export const LAG_THRESHOLD_SEC = 300; // 5 min: Zcash targets 75s blocks with high variance
export const FRESH_MS = 5 * 60_000; // data younger than this is current, whatever the last attempt did
export const DOWN_MS = 15 * 60_000; // red only past this AND while attempts are failing

/** Chain-level state from a snapshot: is the chain moving and is the node caught up. */
export function syncState(lastBlockTime: number | null, height: number | null, headers: number | null, nowMs = Date.now()): SyncState {
  if (height === null || lastBlockTime === null) return "unreachable";
  const lagSec = nowMs / 1000 - lastBlockTime;
  if (lagSec < LAG_THRESHOLD_SEC && (headers === null || headers - height <= 2)) return "synced";
  return "lagging";
}

export interface SnapLike { snapshotAt: number | null; lastBlockTime: number | null; height: number | null; headers: number | null }

/**
 * Status shown everywhere (/, /dashboard, /analytics, API). A single failed attempt never turns the
 * status red: only data age decides, and red additionally requires the provider to be failing now.
 */
export function deriveState(snap: SnapLike | null, health: Degraded | null, now = Date.now()): { state: SyncState; live: boolean; degraded: Degraded | null; providerNote: Degraded | null } {
  if (!snap || snap.snapshotAt === null) {
    return { state: "unreachable", live: false, degraded: health ?? { reason: "unreachable", since: null, retryAt: null }, providerNote: health };
  }
  const age = now - snap.snapshotAt;
  if (age < FRESH_MS) return { state: syncState(snap.lastBlockTime, snap.height, snap.headers, now), live: true, degraded: null, providerNote: health };
  if (age < DOWN_MS || !health) {
    return { state: "delayed", live: false, degraded: { reason: health?.reason ?? "stale", since: health?.since ?? snap.snapshotAt, retryAt: health?.retryAt ?? null, ...(health?.detail ? { detail: health.detail } : {}) }, providerNote: health };
  }
  return { state: "unreachable", live: false, degraded: health, providerNote: health };
}
