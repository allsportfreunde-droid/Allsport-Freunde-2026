import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Internal, token-based or per-person pages have no business in search results.
      disallow: ["/admin", "/api", "/login", "/auth", "/status", "/conversation", "/cancel-registration"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
