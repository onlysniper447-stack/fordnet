import type { MetadataRoute } from "next";
// Lookup pages each cost node-provider compute units; keep crawlers on the overview pages.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/", "/dashboard", "/analytics", "/developers"], disallow: ["/address/", "/tx/", "/block/", "/search", "/api/"] }] };
}
