// Shared district-hub rendering, used by BOTH the root resolver
// (app/[district]/page.tsx, which now serves /kurnool etc.) and the legacy
// app/district/[slug]/page.tsx (kept as a fallback; next.config redirects()
// 301s /district/* to the bare slug before it's normally reached).

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";
import { getSiteConfig, getTrendingArticles } from "@/lib/db-queries";
import { districtHref } from "@/lib/district-href";
import { SectionHub } from "@/lib/section-hub";

function siteUrl(): string {
  return process.env.SITE_URL || "https://rayalaseemanews.com";
}

export async function buildDistrictMetadata(slug: string): Promise<Metadata> {
  const district = await prisma.district.findUnique({ where: { slug } });
  if (!district) return { title: "District not found" };
  const url = `${siteUrl()}${districtHref(slug)}`;
  // Head term "${nameEn} news" leads (search volume target), Telugu mirror
  // for native readers, brand suffix appended by layout.tsx title.template.
  const title = `${district.nameEn} News Today - ${district.name} తాజా వార్తలు`;
  const description = `${district.nameEn} (${district.name}) జిల్లా నుండి తాజా వార్తలు, రాజకీయాలు, క్రీడలు, వాతావరణం, ధరలు. Latest ${district.nameEn} news in Telugu from Rayalaseema News.`;
  return {
    title,
    description,
    keywords: [
      `${district.nameEn} news`,
      `${district.nameEn} news today`,
      `${district.nameEn} latest news`,
      `${district.name} వార్తలు`,
      `${district.name} తాజా వార్తలు`,
      `${district.nameEn} politics`,
      `${district.nameEn} weather`,
      `${district.nameEn} ${district.name} news`,
      "rayalaseema news",
      "telugu news",
    ],
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", locale: "te_IN", siteName: "Rayalaseema News" },
  };
}

export async function DistrictView({ slug }: { slug: string }) {
  const district = await prisma.district.findUnique({
    where: { slug },
    include: {
      constituencies: {
        where: { acNumber: { not: null } },   // safety: hide legacy rows that lack official AC number
        orderBy: { name: "asc" },             // alphabetical by Telugu name
        include: { _count: { select: { mandals: true } } },
      },
    },
  });
  if (!district) return notFound();

  const [config, tagged, trending] = await Promise.all([
    getSiteConfig(),
    prisma.content.findMany({
      where: {
        type: "ARTICLE",
        status: "PUBLISHED",
        OR: [
          // Source of truth: ContentLocation join (district-level + any
          // constituency in this district). The schema marks this join as
          // authoritative for ALL location tags, so an article tagged to the
          // district OR to one of its constituencies always surfaces here.
          { locations: { some: { locationType: "DISTRICT", locationId: district.id } } },
          { locations: { some: { locationType: "CONSTITUENCY", locationId: { in: district.constituencies.map((c) => c.id) } } } },
          // Denormalized fast-path (primary constituency) - covers rows tagged
          // before the join existed and mandal-primary rows that set this.
          { constituencyId: { in: district.constituencies.map((c) => c.id) } },
          // Last-resort fuzzy match on name mentions (kept additive so nothing
          // that used to appear disappears).
          { title: { contains: district.nameEn, mode: "insensitive" } },
          { title: { contains: district.name } },
          { summary: { contains: district.nameEn, mode: "insensitive" } },
        ],
      },
      orderBy: { publishedAt: "desc" },
      take: 30,
      select: { id: true, title: true, slug: true, summary: true, featuredImage: true, category: { select: { name: true, slug: true } } },
    }),
    getTrendingArticles(8),
  ]);

  // Only fall back to site-wide latest when this district has NO mapped
  // articles at all. If even one article maps to the district, show the
  // district's own coverage and hide the "coming soon" banner - the banner
  // must appear only for genuinely empty districts, not thinly-covered ones.
  let articles = tagged;
  let showingGeneral = false;
  if (tagged.length === 0) {
    showingGeneral = true;
    articles = await prisma.content.findMany({
      where: { type: "ARTICLE", status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 15,
      select: { id: true, title: true, slug: true, summary: true, featuredImage: true, category: { select: { name: true, slug: true } } },
    });
  }

  const banner = showingGeneral
    ? `${district.name} జిల్లా వార్తలు త్వరలో - ప్రస్తుతం తాజా వార్తలు చూపిస్తున్నాము.`
    : null;

  return (
    <SectionHub
      config={config}
      slug={slug}
      title={`${district.name} జిల్లా`}
      subtitle={`${district.nameEn} · ${district.constituencies.length} నియోజకవర్గాలు`}
      breadcrumbName={`${district.name} (${district.nameEn})`}
      banner={banner}
      articles={articles}
      trending={trending}
      siteUrl={siteUrl()}
    />
  );
}
