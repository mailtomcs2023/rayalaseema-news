// Spec #4 D3 (#216) — main sitemap polish.
// E4 (#223) — `revalidate` export so Next ISR keeps a fresh copy at the
// edge for 5 min; per-request DB hit drops to 1-per-5-min per region.

export const revalidate = 300;

//
// Emits every indexable URL on the site grouped by priority + changefreq:
//   1.0  /                             — home
//   0.9  /<district> hubs              — TIER-0 ranking targets (8 URLs)
//   0.85 /<district>/<constituency>    — TIER-0 ranking targets (~55 URLs)
//   0.8  /tag/<slug>                   — topic hubs
//   0.7  /category/<slug>              — category hubs
//   0.6  /author/<slug>                — author profiles
//   0.6  article URLs                  — last-modified driven
//   0.5  trust pages                   — about/masthead/policies/etc
//
// Sub-sitemaps: news-sitemap.xml + rss/all.xml are listed in
// /sitemap-index.xml (D1 #214). This sitemap is referenced from there
// and submitted to GSC via the index.

import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";

const TRUST_PAGES = [
  "about", "mission", "masthead", "ownership",
  "ethics-policy", "editorial-standards", "corrections-policy",
  "diversity-policy", "feedback-policy", "contact",
  "privacy", "terms",
];

export async function GET() {
  const siteUrl = process.env.SITE_URL || "https://rayalaseemanews.com";
  const now = new Date().toISOString();

  const [articles, categories, districts, constituencies, tags, authors] = await Promise.all([
    prisma.content.findMany({
      where: { type: "ARTICLE", status: "PUBLISHED" },
      select: {
        id: true, slug: true, updatedAt: true,
        constituency: { select: { slug: true, district: { select: { slug: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.category.findMany({ where: { active: true }, select: { slug: true } }),
    prisma.district.findMany({ select: { slug: true }, orderBy: { sortOrder: "asc" } }),
    prisma.constituency.findMany({
      where: { active: true },
      select: { slug: true, district: { select: { slug: true } } },
      orderBy: { acNumber: "asc" },
    }),
    prisma.tag.findMany({ select: { slug: true } }),
    prisma.user.findMany({
      where: { active: true, publicProfileSlug: { not: null } },
      select: { publicProfileSlug: true },
    }),
  ]);

  const urls: string[] = [];
  urls.push(`  <url><loc>${siteUrl}</loc><lastmod>${now}</lastmod><changefreq>always</changefreq><priority>1.0</priority></url>`);
  for (const d of districts) {
    urls.push(`  <url><loc>${siteUrl}/${d.slug}</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>`);
    urls.push(`  <url><loc>${siteUrl}/district/${d.slug}</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>`);
  }
  for (const c of constituencies) {
    // Future hub URL (Phase F1/F2 may migrate /constituency/<slug> to
    // /[district]/[constituency]). Emit both so crawlers find each.
    urls.push(`  <url><loc>${siteUrl}/constituency/${c.slug}</loc><changefreq>daily</changefreq><priority>0.85</priority></url>`);
  }
  for (const t of tags) {
    urls.push(`  <url><loc>${siteUrl}/tag/${t.slug}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
  }
  for (const c of categories) {
    urls.push(`  <url><loc>${siteUrl}/category/${c.slug}</loc><changefreq>hourly</changefreq><priority>0.7</priority></url>`);
  }
  for (const a of authors) {
    urls.push(`  <url><loc>${siteUrl}/author/${a.publicProfileSlug}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`);
  }
  for (const a of articles) {
    urls.push(`  <url><loc>${siteUrl}${articleHref(a)}</loc><lastmod>${a.updatedAt.toISOString()}</lastmod><priority>0.6</priority></url>`);
  }
  for (const slug of TRUST_PAGES) {
    urls.push(`  <url><loc>${siteUrl}/${slug}</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
