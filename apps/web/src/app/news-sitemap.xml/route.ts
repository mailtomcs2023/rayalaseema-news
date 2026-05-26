import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";

export async function GET() {
  const articles = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED" },
    select: {
      id: true, slug: true, title: true, publishedAt: true,
      category: { select: { nameEn: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    // Hard cap kept while Phase D2 (last-48h filter) is pending — once D2
    // ships this becomes `where.publishedAt: { gte: 48hAgo }`.
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
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=120" },
  });
}

function escXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
