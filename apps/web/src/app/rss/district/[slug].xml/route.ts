// E4 (#223) - 5-min ISR. force-dynamic for the same reason as the
// category sibling (#223 commit notes).
export const dynamic = "force-dynamic";
export const revalidate = 300;

// Spec #4 D6 (#219) - per-district RSS feed.
//
// /rss/district/<slug>.xml - 30 most-recent articles tagged to the district
// (via primary constituency). District-loyal subscribers + aggregator
// district-specific feeds (Telugu newsletters etc).

import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";
import { notFound } from "next/navigation";

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

// params typed with optional slug: the `[slug].xml` partial segment makes
// Next's generated route validator infer empty params, so a required `slug`
// fails typecheck. Guard for the (runtime-impossible) undefined case.
export async function GET(_req: Request, ctx: { params: Promise<{ slug?: string }> }) {
  const { slug: rawSlug } = await ctx.params;
  if (!rawSlug) return notFound();
  // Accept "<slug>" or "<slug>.xml" - Next routes the file-name form as the
  // dynamic segment value including the extension.
  const slug = rawSlug.endsWith(".xml") ? rawSlug.slice(0, -4) : rawSlug;

  const district = await prisma.district.findUnique({
    where: { slug },
    select: { id: true, name: true, nameEn: true, slug: true, constituencies: { select: { id: true } } },
  });
  if (!district) return notFound();

  const siteUrl = process.env.SITE_URL || "https://rayalaseemanews.com";
  const articles = await prisma.content.findMany({
    where: {
      type: "ARTICLE",
      status: "PUBLISHED",
      constituencyId: { in: district.constituencies.map((c) => c.id) },
    },
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
    <title>Rayalaseema News - ${escXml(district.nameEn)} (${escXml(district.name)})</title>
    <link>${siteUrl}/district/${district.slug}</link>
    <atom:link href="${siteUrl}/rss/district/${district.slug}.xml" rel="self" type="application/rss+xml" />
    <description>News from ${escXml(district.nameEn)} district.</description>
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
