// Shared constituency-hub rendering + metadata. Used by the canonical nested
// route app/[district]/[constituency]/page.tsx. The legacy app/constituency/
// [slug] route now 301s to the nested URL instead of rendering.
//
// The hub lists articles tagged to the constituency. The district segment in
// the URL is validated against the constituency's real district; a mismatch
// 301s to the canonical nested URL.
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { prisma } from "@rayalaseema/db";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";
import { articleHref } from "@/lib/article-href";
import { constituencyHref } from "@/lib/constituency-href";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export async function buildConstituencyMetadata(districtSlug: string, constituencySlug: string): Promise<Metadata> {
  const constituency = await prisma.constituency.findUnique({
    where: { slug: constituencySlug },
    include: { district: true },
  });
  if (!constituency) return { title: "Constituency not found" };
  const url = `${SITE_URL}${constituencyHref(constituency.district.slug, constituency.slug)}`;
  const title = `${constituency.nameEn} Constituency News - ${constituency.name} వార్తలు`;
  const description = `${constituency.nameEn} (${constituency.name}) నియోజకవర్గం నుండి తాజా వార్తలు, రాజకీయాలు, MLA, అభివృద్ధి కార్యక్రమాలు. ${constituency.district.nameEn} district. Latest political + civic news from Rayalaseema News.`;
  return {
    title,
    description,
    keywords: [
      `${constituency.nameEn} constituency`,
      `${constituency.nameEn} news`,
      `${constituency.nameEn} MLA`,
      `${constituency.name} నియోజకవర్గం`,
      `${constituency.name} వార్తలు`,
      `${constituency.district.nameEn} ${constituency.nameEn}`,
      "rayalaseema news",
      "andhra pradesh politics",
    ],
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", locale: "te_IN", siteName: "Rayalaseema News" },
  };
}

export async function ConstituencyView({ districtSlug, constituencySlug }: { districtSlug: string; constituencySlug: string }) {
  const constituency = await prisma.constituency.findUnique({
    where: { slug: constituencySlug },
    include: { district: true, mandals: { orderBy: { sortOrder: "asc" } } },
  });

  if (!constituency) return notFound();

  // Canonical-URL guard: the district segment must match the constituency's
  // real district. /wrong-district/adoni 301s to /kurnool/adoni.
  if (constituency.district.slug !== districtSlug) {
    permanentRedirect(constituencyHref(constituency.district.slug, constituency.slug));
  }

  const articles = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED", constituencyId: constituency.id },
    include: {
      category: { select: { name: true, slug: true, color: true } },
      author: { select: { name: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: SITE_URL },
      { name: constituency.district.name, url: `${SITE_URL}/${constituency.district.slug}` },
      { name: constituency.name },
    ],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      {/* A constituency is a child of its district - show the district's secondary header. */}
      <SiteHeader activeSectionSlug={constituency.district.slug} />

      <div style={{ background: "#fff", borderBottom: "3px solid var(--color-brand)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 12px" }}>
          {/* Telugu name big, English meta inline to its right. Font sizes unchanged. */}
          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "var(--color-brand)", margin: 0 }}>{constituency.name}</h1>
            <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
              {constituency.nameEn} | {constituency.district.nameEn} District | {constituency.mandals.length} Mandals | Lok Sabha: {constituency.loksabha}
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {constituency.mandals.map((m) => (
              <span key={m.id} style={{ padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 600, background: "#f3f4f6", color: "#555", border: "1px solid #e5e7eb" }}>
                {m.nameEn}
              </span>
            ))}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 12px" }}>
        {articles.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {articles.map((article) => (
              <Link key={article.id} href={articleHref(article as never)} style={{ textDecoration: "none" }}>
                <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #eee" }}>
                  {article.featuredImage && (
                    <img src={article.featuredImage} alt="" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover" }} />
                  )}
                  <div style={{ padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                      <svg width="12" height="12" fill="var(--color-brand)" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-brand)" }}>{constituency.nameEn}</span>
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: "#000", lineHeight: 1.5 }}>{article.title}</h3>
                    <p style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
                      {article.author.name} | {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("te-IN") : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 10, border: "1px solid #eee" }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#333" }}>{constituency.name} వార్తలు త్వరలో...</p>
            <p style={{ fontSize: 14, color: "#888", marginTop: 8 }}>No articles tagged to this constituency yet. Articles will appear here when reporters tag them to this location.</p>
            <Link href={`/${constituency.district.slug}`} style={{ display: "inline-block", marginTop: 16, padding: "10px 24px", background: "var(--color-brand)", color: "#fff", borderRadius: 8, fontWeight: 700, textDecoration: "none" }}>
              Back to {constituency.district.name}
            </Link>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
