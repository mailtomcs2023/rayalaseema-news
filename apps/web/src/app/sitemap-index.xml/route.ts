// E4 (#223) — sitemap-index changes rarely; long revalidate.

export const revalidate = 3600;

// Spec #4 D1 (#214) — /sitemap-index.xml.
//
// Single submission point for GSC + Bing. References:
//   - /sitemap.xml         (main sitemap: hubs + categories + articles)
//   - /news-sitemap.xml    (Google News spec: last-48h articles only)
//   - /rss/all.xml         (D6 #219 — RSS aggregator pickup)
//
// Robots.txt also references this index (see D4 #217). GSC + Bing accept
// either a sitemap.xml or a sitemap-index.xml as the submission entry;
// index is preferred when you have multiple sitemaps so you only manage
// one URL in the webmaster tools.

export async function GET() {
  const siteUrl = process.env.SITE_URL || "https://rayalaseemanews.com";
  const now = new Date().toISOString();

  const sitemaps = [
    { loc: `${siteUrl}/sitemap.xml`, lastmod: now },
    { loc: `${siteUrl}/news-sitemap.xml`, lastmod: now },
    { loc: `${siteUrl}/rss/all.xml`, lastmod: now },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map((s) => `  <sitemap><loc>${s.loc}</loc><lastmod>${s.lastmod}</lastmod></sitemap>`).join("\n")}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
