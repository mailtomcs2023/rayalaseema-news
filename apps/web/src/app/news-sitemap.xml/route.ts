import { prisma } from "@rayalaseema/db";

export async function GET() {
  const articles = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, title: true, publishedAt: true, category: { select: { nameEn: true } } },
    orderBy: { publishedAt: "desc" },
    take: 1000,
  });

  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${articles.map((a) => `  <url>
    <loc>${siteUrl}/article/${a.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>Rayalaseema Express</news:name>
        <news:language>te</news:language>
      </news:publication>
      <news:publication_date>${(a.publishedAt || new Date()).toISOString()}</news:publication_date>
      <news:title>${escXml(a.title)}</news:title>
      <news:keywords>${escXml(a.category.nameEn || "")}</news:keywords>
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
