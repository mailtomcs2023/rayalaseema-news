import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/search",          // dynamic search pages — no SEO value
          "/admin/",
          "/_next/",
          "/*?preview=*",     // any preview-mode URLs
        ],
      },
    ],
    sitemap: [
      `${siteUrl}/sitemap.xml`,
      `${siteUrl}/news-sitemap.xml`,
    ],
    host: siteUrl,
  };
}
