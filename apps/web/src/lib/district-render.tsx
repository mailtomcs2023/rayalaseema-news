// Shared district-hub rendering, used by BOTH the root resolver
// (app/[district]/page.tsx, which now serves /kurnool etc.) and the legacy
// app/district/[slug]/page.tsx (kept as a fallback; next.config redirects()
// 301s /district/* to the bare slug before it's normally reached).

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSiteConfig, getTrendingArticles } from "@/lib/db-queries";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";
import { articleHref } from "@/lib/article-href";
import { districtHref } from "@/lib/district-href";

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

  const lead = articles[0];
  const grid = articles.slice(1, 5);
  const rest = articles.slice(5);

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: siteUrl() },
      { name: `${district.name} (${district.nameEn})` },
    ],
  });

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <SiteHeader config={config} breakingNews={[]} activeSectionSlug={slug} />

      {/* District header - plain white bg, title in dark text, matches site shell */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 12px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 26, fontWeight: 800, color: "var(--n-900, #111827)" }}>
            {district.name} జిల్లా
          </span>
          <div style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {district.nameEn} · {district.constituencies.length} నియోజకవర్గాలు
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 12px 48px" }}>
        {showingGeneral && (
          <div
            style={{
              fontFamily: "var(--font-telugu-body), sans-serif",
              fontSize: 13,
              color: "#92400e",
              background: "#fef3c7",
              border: "1px solid #fbbf24",
              borderRadius: 6,
              padding: "8px 14px",
              marginBottom: 14,
            }}
          >
            {district.name} జిల్లా వార్తలు త్వరలో - ప్రస్తుతం తాజా వార్తలు చూపిస్తున్నాము.
          </div>
        )}

        <div style={{ display: "flex", gap: 28 }}>
          {/* MAIN */}
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            {!lead && (
              <p style={{ fontFamily: "var(--font-telugu-body), sans-serif", color: "#6b7280", padding: "40px 0" }}>
                వార్తలు త్వరలో…
              </p>
            )}

            {lead && (
              <Link href={articleHref(lead)} style={{ display: "block", textDecoration: "none", marginBottom: 18 }}>
                {lead.featuredImage && (
                  <img
                    src={lead.featuredImage}
                    alt={lead.title}
                    style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 6, display: "block" }}
                  />
                )}
                <h1
                  style={{
                    fontFamily: "var(--font-telugu-heading), serif",
                    fontSize: 28,
                    fontWeight: 800,
                    lineHeight: 1.25,
                    color: "var(--n-900, #111827)",
                    margin: "12px 0 6px",
                  }}
                >
                  {lead.title}
                </h1>
                {lead.summary && (
                  <p style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>
                    {lead.summary}
                  </p>
                )}
              </Link>
            )}

            {grid.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 18,
                  paddingTop: 16,
                  borderTop: "2px solid var(--n-900, #111827)",
                }}
              >
                {grid.map((a) => (
                  <Link key={a.id} href={articleHref(a)} style={{ display: "flex", gap: 12, textDecoration: "none" }}>
                    {a.featuredImage && (
                      <img
                        src={a.featuredImage}
                        alt={a.title}
                        loading="lazy"
                        style={{ width: 110, height: 74, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                      />
                    )}
                    <h3
                      style={{
                        fontFamily: "var(--font-telugu-heading), serif",
                        fontSize: 15,
                        fontWeight: 700,
                        lineHeight: 1.35,
                        color: "var(--n-900, #111827)",
                        margin: 0,
                      }}
                    >
                      {a.title}
                    </h3>
                  </Link>
                ))}
              </div>
            )}

            {rest.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {rest.map((a) => (
                  <Link
                    key={a.id}
                    href={articleHref(a)}
                    style={{
                      display: "flex",
                      gap: 14,
                      padding: "14px 0",
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                      textDecoration: "none",
                    }}
                  >
                    {a.featuredImage && (
                      <img
                        src={a.featuredImage}
                        alt=""
                        loading="lazy"
                        style={{ width: 150, height: 96, objectFit: "cover", borderRadius: 5, flexShrink: 0 }}
                      />
                    )}
                    <div>
                      <h3
                        style={{
                          fontFamily: "var(--font-telugu-heading), serif",
                          fontSize: 17,
                          fontWeight: 700,
                          lineHeight: 1.35,
                          color: "var(--n-900, #111827)",
                          margin: 0,
                        }}
                      >
                        {a.title}
                      </h3>
                      {a.summary && (
                        <p style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 13, color: "#6b7280", lineHeight: 1.55, margin: "5px 0 0" }}>
                          {a.summary}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* RAIL */}
          {/* Sticky so the constituencies + trending rail follows the reader.
              alignSelf:start stops the flex item stretching (needed for sticky);
              scrolls internally if taller than the viewport. */}
          {/* top:96 clears the sticky primary nav (40px) + secondary header
              (40px) so the Trending card sits below them, not tucked underneath. */}
          <aside style={{ flex: "0 0 290px", position: "sticky", top: 96, alignSelf: "flex-start", maxHeight: "calc(100vh - 112px)", overflowY: "auto" }}>
            {/* Constituencies list removed - the secondary header now lists
                them; clicking one filters to that constituency. */}

            {/* Trending - same card UI as the article page */}
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", padding: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-brand)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--color-brand)" }}>
                Trending
              </h3>
              {trending.map((t, i) => (
                <Link key={t.id} href={articleHref(t)} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f5", textDecoration: "none" }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: i < 3 ? "var(--color-brand)" : "#ddd", width: 28, flexShrink: 0 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#111", lineHeight: 1.5 }}>{t.title}</p>
                    <p style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{t.viewCount.toLocaleString()} views</p>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </main>

      <SiteFooter config={config} />

      <style>{`
        .cat-rail-head {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px;
          font-weight: 800;
          color: var(--n-900, #111827);
          padding-bottom: 8px;
          border-bottom: 2px solid var(--n-900, #111827);
          margin-bottom: 4px;
        }
        @media (max-width: 900px) {
          main > div { flex-direction: column !important; }
          aside { flex-basis: auto !important; }
        }
      `}</style>
    </div>
  );
}
