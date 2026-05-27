import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";

// Spec #4 D2 (#215) — Google News sitemap with the 48-hour freshness
// filter the Google News protocol expects. Articles older than 48h drop
// out automatically; Google News pulls the sitemap every few minutes
// and stale entries silently disappear. Cached for 60s — short enough
// that a freshly-published article shows up quickly but long enough
// that the Prisma query isn't hit on every crawler request.

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export async function GET() {
  const fortyEightHoursAgo = new Date(Date.now() - FORTY_EIGHT_HOURS_MS);
  const articles = await prisma.content.findMany({
    where: {
      type: "ARTICLE",
      status: "PUBLISHED",
      publishedAt: { gte: fortyEightHoursAgo },
    },
    select: {
      id: true, slug: true, title: true, publishedAt: true,
      category: { select: { nameEn: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    // Google News sitemap spec hard-caps at 1000 entries. At our publish
    // volume the 48h window is well under that; the take is defence in
    // depth in case of a publish-burst.
    take: 1000,
  });

  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${articles.map((a) => `  <url>
    <loc>${siteUrl}${articleHref(a)}</loc>
    <news:news>
      <news:publication>
        <news:name>Rayalaseema Express</news:name>
        <news:language>te</news:language>
      </news:publication>
      <news:publication_date>${(a.publishedAt || new Date()).toISOString()}</news:publication_date>
      <news:title>${escXml(a.title)}</news:title>
      <news:keywords>${escXml(a.category?.nameEn || "")}</news:keywords>
    </news:news>
  </url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=60, s-maxage=60" },
  });
}

function escXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
