import type { PoolValues, RpcValuePool } from "./types";
export function poolsFrom(vp: RpcValuePool[] | undefined): PoolValues {
  const get = (id: string) => {
    const p = vp?.find((x) => x.id === id);
    return p && p.monitored && typeof p.chainValue === "number" ? p.chainValue : null;
  };
  return { transparent: get("transparent"), sprout: get("sprout"), sapling: get("sapling"), orchard: get("orchard"), lockbox: get("lockbox"), ironwood: get("ironwood") };
}
export const POOL_KEYS = ["transparent", "sprout", "sapling", "orchard", "lockbox", "ironwood"] as const;
