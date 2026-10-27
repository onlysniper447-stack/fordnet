import { describe, expect, it } from "vitest";
import { detectInput, blocksQuerySchema, rangeSchema } from "../src/lib/detect";

const H = "00000000012a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4";
const T = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("detectInput", () => {
  it("detects heights", () => { expect(detectInput(" 2500000 ")).toEqual({ type: "height", value: 2500000 }); expect(detectInput("0")).toEqual({ type: "height", value: 0 }); expect(detectInput("2,500,000")).toEqual({ type: "height", value: 2500000 }); });
  it("rejects absurd heights", () => expect(detectInput("12345678901").type).toBe("unknown"));
  it("classifies 64-hex with block/tx hint", () => {
    expect(detectInput(H)).toEqual({ type: "hex64", value: H, likely: "block" });
    expect(detectInput(T.toUpperCase())).toEqual({ type: "hex64", value: T, likely: "tx" });
    expect(detectInput("0x" + T)).toMatchObject({ type: "hex64", value: T });
  });
  it("detects t1/t3 addresses", () => {
    expect(detectInput("t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs").type).toBe("taddr");
    expect(detectInput("t3Vz22vK5z2LcKEdg16Yv4FFneEL1zg9ojd").type).toBe("taddr");
  });
  it("rejects malformed addresses and hex", () => {
    expect(detectInput("t2Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs").type).toBe("unknown");
    expect(detectInput("t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLb0").type).toBe("unknown"); // '0' not base58
    expect(detectInput("abc123").type).toBe("unknown");
    expect(detectInput(T.slice(1)).type).toBe("unknown");
  });
  it("flags shielded/unified addresses", () => { expect(detectInput("zs1abcdef").type).toBe("shielded"); expect(detectInput("u1qwerty").type).toBe("shielded"); });
  it("handles empty", () => expect(detectInput("   ").type).toBe("empty"));
});

describe("query schemas", () => {
  it("limit bounds", () => {
    expect(blocksQuerySchema.parse({}).limit).toBe(20);
    expect(blocksQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(blocksQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(blocksQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
  });
  it("range enum", () => { expect(rangeSchema.parse(undefined)).toBe("30d"); expect(rangeSchema.safeParse("1y").success).toBe(false); });
});
