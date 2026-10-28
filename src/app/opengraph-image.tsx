import { ImageResponse } from "next/og";

export const alt = "Fordnet — Zcash network data and a public REST API";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0a0f0d", color: "#e8f0ec", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: "#3EE08F" }} />
          <div style={{ fontSize: 44, fontWeight: 700 }}>Fordnet</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>Zcash network data you can query in one request.</div>
          <div style={{ fontSize: 30, color: "#9fb0a8" }}>Dashboard and REST API. Public protocol data only.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#9fb0a8", borderTop: "2px solid #26332d", paddingTop: 28 }}>
          <span>fordnet.vercel.app</span><span style={{ color: "#3EE08F" }}>ZECATHON · Core &amp; Tooling</span>
        </div>
      </div>
    ),
    size,
  );
}
