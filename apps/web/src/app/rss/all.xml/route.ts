// E4 (#223) - 5-min ISR matches Cache-Control header.

export const revalidate = 300;

// Spec #4 D6 (#219) - site-wide RSS 2.0 feed.
//
// 50 most-recent published articles across all districts + categories.
// Aggregator pickup (Feedly, InoReader, NewsBlur) routes traffic from
// power-readers + indirectly improves discoverability via aggregator-
// driven crawls.

import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export async function GET() {
  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  const articles = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED" },
    select: {
      id: true, slug: true, title: true, summary: true, publishedAt: true,
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  const now = new Date().toUTCString();
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
    <title>Rayalaseema Express - All news</title>
    <link>${siteUrl}</link>
    <atom:link href="${siteUrl}/rss/all.xml" rel="self" type="application/rss+xml" />
    <description>Latest news from across the 8 districts of the Rayalaseema region.</description>
    <language>te</language>
    <lastBuildDate>${now}</lastBuildDate>
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
