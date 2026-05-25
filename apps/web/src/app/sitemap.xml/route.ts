import { prisma } from "@rayalaseema/db";

export async function GET() {
  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";

  const [articles, categories] = await Promise.all([
    prisma.content.findMany({
      where: { type: "ARTICLE", status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.category.findMany({ where: { active: true }, select: { slug: true } }),
  ]);

  const districts = ["kurnool", "nandyal", "ananthapuramu", "sri-sathya-sai", "ysr-kadapa", "tirupati", "annamayya", "chittoor"];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteUrl}</loc><changefreq>always</changefreq><priority>1.0</priority></url>
${districts.map((d) => `  <url><loc>${siteUrl}/district/${d}</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`).join("\n")}
${categories.map((c) => `  <url><loc>${siteUrl}/category/${c.slug}</loc><changefreq>hourly</changefreq><priority>0.7</priority></url>`).join("\n")}
${articles.map((a) => `  <url><loc>${siteUrl}/article/${a.slug}</loc><lastmod>${a.updatedAt.toISOString()}</lastmod><priority>0.6</priority></url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=300" },
  });
}
