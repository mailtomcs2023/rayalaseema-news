import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@rayalaseema/db";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSiteConfig } from "@/lib/db-queries";
import { articleHref } from "@/lib/article-href";

export const metadata: Metadata = {
  title: "సినిమా | రాయలసీమ న్యూస్",
  description:
    "టాలీవుడ్, బాలీవుడ్, హాలీవుడ్ సినిమా వార్తలు, మూవీ రివ్యూలు, రేటింగ్‌లు - రాయలసీమ న్యూస్.",
};

const TABS = [
  { key: "all", label: "అన్నీ" },
  { key: "tollywood", label: "టాలీవుడ్" },
  { key: "bollywood", label: "బాలీవుడ్" },
  { key: "hollywood", label: "హాలీవుడ్" },
  { key: "tv", label: "టీవీ" },
  { key: "reviews", label: "రివ్యూలు" },
];

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, rating));
  return (
    <span style={{ display: "inline-flex", gap: 1 }} aria-label={`${r}/5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, r - i));
        return (
          <span key={i} style={{ position: "relative", fontSize: 14, lineHeight: 1 }}>
            <span style={{ color: "#e5e7eb" }}>★</span>
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                overflow: "hidden",
                width: `${fill * 100}%`,
                color: "#F5A623",
                whiteSpace: "nowrap",
              }}
            >
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

export default async function CinemaPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const tab = TABS.some((x) => x.key === t) ? t! : "all";

  const config = await getSiteConfig();

  const cats = await prisma.category.findMany({
    where: { slug: { in: ["entertainment", "movie-reviews"] } },
    select: { id: true, slug: true },
  });
  const entId = cats.find((c) => c.slug === "entertainment")?.id;
  const revId = cats.find((c) => c.slug === "movie-reviews")?.id;
  const catIds = cats.map((c) => c.id);

  // Tab → keyword filter (no sub-category data, so filter by title keyword where it makes sense)
  const KEYWORDS: Record<string, string[]> = {
    tollywood: ["టాలీవుడ్", "తెలుగు", "Tollywood", "Telugu"],
    bollywood: ["బాలీవుడ్", "Bollywood", "Hindi"],
    hollywood: ["హాలీవుడ్", "Hollywood"],
    tv: ["టీవీ", "TV", "సీరియల్", "OTT"],
  };

  // Spec #1 A1C (#189) - reads Content where type=ARTICLE. rating + reviewerName
  // come from payload now, projected after fetch.
  const where: any = { type: "ARTICLE", status: "PUBLISHED", categoryId: { in: catIds } };
  if (tab === "reviews" && revId) {
    where.categoryId = revId;
  } else if (KEYWORDS[tab]) {
    where.OR = KEYWORDS[tab].map((k) => ({ title: { contains: k, mode: "insensitive" as const } }));
  }

  const projectRating = <T extends { payload?: unknown }>(row: T) => {
    const p = (row.payload as Record<string, unknown> | null) || {};
    return {
      ...row,
      rating: typeof p.rating === "number" ? p.rating : null,
      reviewerName: typeof p.reviewerName === "string" ? p.reviewerName : null,
    };
  };

  const [articlesRaw, reviewsRaw] = await Promise.all([
    prisma.content.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: 24,
      select: {
        id: true, title: true, slug: true, summary: true, featuredImage: true,
        payload: true,
        category: { select: { slug: true } },
      },
    }),
    revId
      ? prisma.content.findMany({
          where: { type: "ARTICLE", status: "PUBLISHED", categoryId: revId },
          orderBy: { publishedAt: "desc" },
          take: 10,
          select: { id: true, title: true, slug: true, payload: true },
        })
      : // Typed empty fallback - without this annotation the union collapses
        // to `never[]` and reviewsRaw loses the {id, title, slug} fields,
        // breaking the projectRating spread downstream.
        Promise.resolve([] as Array<{ id: string; title: string; slug: string | null; payload: unknown }>),
  ]);
  const articles = articlesRaw.map(projectRating);
  const reviews = reviewsRaw.map(projectRating);

  const lead = articles[0];
  const rest = articles.slice(1);

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <SiteHeader config={config} breakingNews={[]} />

      {/* Branded header */}
      <div style={{ background: "var(--brand, #E01B1B)" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "12px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-telugu-heading), serif",
              fontSize: 26,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            సినిమా
          </span>
          <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TABS.map((x) => (
              <Link
                key={x.key}
                href={x.key === "all" ? "/cinema" : `/cinema?t=${x.key}`}
                style={{
                  fontFamily: "var(--font-telugu-body), sans-serif",
                  fontSize: 12,
                  fontWeight: 700,
                  color: tab === x.key ? "var(--brand, #E01B1B)" : "#fff",
                  background: tab === x.key ? "#fff" : "transparent",
                  textDecoration: "none",
                  padding: "4px 14px",
                  border: "1px solid rgba(255,255,255,0.55)",
                  borderRadius: 999,
                }}
              >
                {x.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 12px 48px", display: "flex", gap: 28 }}>
        {/* MAIN */}
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          {!lead && (
            <p style={{ fontFamily: "var(--font-telugu-body), sans-serif", color: "#6b7280", padding: "40px 0" }}>
              వార్తలు త్వరలో…
            </p>
          )}

          {lead && (
            <Link href={articleHref(lead)} style={{ display: "block", textDecoration: "none", marginBottom: 20 }}>
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
                  fontSize: 26,
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

          {/* Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
            {rest.map((a) => (
              <Link key={a.id} href={articleHref(a)} style={{ textDecoration: "none" }}>
                {a.featuredImage ? (
                  <img
                    src={a.featuredImage}
                    alt={a.title}
                    loading="lazy"
                    style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", borderRadius: 5, display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "16/10",
                      background: "#f3f4f6",
                      borderRadius: 5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#d1d5db",
                      fontWeight: 800,
                    }}
                  >
                    RE
                  </div>
                )}
                <h3
                  style={{
                    fontFamily: "var(--font-telugu-heading), serif",
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1.35,
                    color: "var(--n-900, #111827)",
                    margin: "8px 0 0",
                  }}
                >
                  {a.title}
                </h3>
                {typeof a.rating === "number" && (
                  <div style={{ marginTop: 5 }}>
                    <Stars rating={a.rating} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>

        {/* REVIEW RAIL */}
        {reviews.length > 0 && (
          <aside style={{ flex: "0 0 260px", borderLeft: "1px solid rgba(0,0,0,0.08)", paddingLeft: 22 }}>
            <div
              style={{
                fontFamily: "var(--font-telugu-heading), serif",
                fontSize: 15,
                fontWeight: 800,
                color: "var(--n-900, #111827)",
                borderBottom: "2px solid var(--n-900, #111827)",
                paddingBottom: 8,
                marginBottom: 4,
              }}
            >
              మూవీ రివ్యూ
            </div>
            {reviews.map((rv) => (
              <Link
                key={rv.id}
                href={articleHref(rv)}
                style={{
                  display: "block",
                  textDecoration: "none",
                  padding: "11px 0",
                  borderBottom: "1px dotted rgba(0,0,0,0.18)",
                }}
              >
                <h4
                  style={{
                    fontFamily: "var(--font-telugu-heading), serif",
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1.3,
                    color: "var(--n-900, #111827)",
                    margin: "0 0 4px",
                  }}
                >
                  {rv.title}
                </h4>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {rv.reviewerName && (
                    <span style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 11, color: "#6b7280" }}>
                      {rv.reviewerName}
                    </span>
                  )}
                  {typeof rv.rating === "number" && <Stars rating={rv.rating} />}
                </div>
              </Link>
            ))}
          </aside>
        )}
      </main>

      <SiteFooter config={config} />
    </div>
  );
}
