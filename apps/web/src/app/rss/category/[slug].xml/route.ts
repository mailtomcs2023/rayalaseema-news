// E4 (#223) — 5-min ISR. dynamic param can't be enumerated at build
// (categories are user-data), so force-dynamic skips the prerender
// attempt that was crashing with "Cannot destructure property 'slug' of
// '(intermediate value)' as it is undefined". Per-request rendering
// stays cheap thanks to the revalidate window below.
export const dynamic = "force-dynamic";
export const revalidate = 300;

// Spec #4 D6 (#219) — per-category RSS feed.
//
// /rss/category/<slug>.xml — 30 most-recent articles in the category.
// Category subscribers (e.g. cinema, mandi-rates, exam-results) get a
// focused feed.

import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";
import { notFound } from "next/navigation";

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await ctx.params;
  const slug = rawSlug.endsWith(".xml") ? rawSlug.slice(0, -4) : rawSlug;

  const category = await prisma.category.findUnique({
    where: { slug },
    select: { id: true, name: true, nameEn: true, slug: true },
  });
  if (!category) return notFound();

  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  const articles = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED", categoryId: category.id },
    select: {
      id: true, slug: true, title: true, summary: true, publishedAt: true,
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: 30,
  });

  const items = articles.map((a) => {
    const link = `${siteUrl}${articleHref(a)}`;
    const pub = (a.publishedAt || new Date()).toUTCString();
    return `    <item>
      <title>${escXml(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pub}</pubDate>
      <description>${cdata(a.summary || a.title)}</description>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Rayalaseema Express — ${escXml(category.nameEn || category.name)}</title>
    <link>${siteUrl}/category/${category.slug}</link>
    <atom:link href="${siteUrl}/rss/category/${category.slug}.xml" rel="self" type="application/rss+xml" />
    <description>${escXml(category.nameEn || category.name)} news from Rayalaseema Express.</description>
    <language>te</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
