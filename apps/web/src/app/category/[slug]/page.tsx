import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { getSiteConfig, getTrendingArticles, getCricketScores } from "@/lib/db-queries";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) return { title: "Category not found" };
  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  return {
    title: `${cat.name} | రాయలసీమ ఎక్స్‌ప్రెస్`,
    description: cat.description || `${cat.name} — తాజా వార్తలు, విశ్లేషణలు`,
    alternates: { canonical: `${siteUrl}/category/${slug}` },
    openGraph: { title: cat.name, url: `${siteUrl}/category/${slug}`, type: "website", locale: "te_IN" },
  };
}

function timeAgo(d: Date | null): string {
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} నిమి.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} గం.`;
  return `${Math.floor(h / 24)} రోజులు`;
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return notFound();

  const isSports = slug === "sports";
  const isPolitics = slug === "politics";

  const [config, articles, trending, cricketScores, cartoon] = await Promise.all([
    getSiteConfig(),
    prisma.article.findMany({
      where: { status: "PUBLISHED", categoryId: category.id },
      orderBy: { publishedAt: "desc" },
      take: 30,
      select: { id: true, title: true, slug: true, summary: true, featuredImage: true, publishedAt: true },
    }),
    getTrendingArticles(8),
    isSports ? getCricketScores() : Promise.resolve([]),
    isPolitics ? prisma.cartoon.findFirst({ where: { active: true }, orderBy: { date: "desc" } }) : Promise.resolve(null),
  ]);

  const lead = articles[0];
  const grid = articles.slice(1, 5);
  const rest = articles.slice(5);

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <Header config={config} breakingNews={[]} />

      {/* Branded header */}
      <div style={{ background: "var(--brand, #E01B1B)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "12px" }}>
          <span style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 26, fontWeight: 800, color: "#fff" }}>
            {category.name}
          </span>
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

          {/* Lead */}
          {lead && (
            <Link href={`/article/${lead.slug}`} style={{ display: "block", textDecoration: "none", marginBottom: 18 }}>
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

          {/* 2x2 grid */}
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
                <Link key={a.id} href={`/article/${a.slug}`} style={{ display: "flex", gap: 12, textDecoration: "none" }}>
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

          {/* Rest — text list */}
          {rest.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {rest.map((a) => (
                <Link
                  key={a.id}
                  href={`/article/${a.slug}`}
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
        <aside style={{ flex: "0 0 290px" }}>
          {/* Sports → live scores */}
          {isSports && cricketScores.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="cat-rail-head">
                {cricketScores.some((m) => m.isLive) ? "లైవ్ స్కోర్" : "రాబోయే మ్యాచ్‌లు"}
              </div>
              {cricketScores.map((m) => (
                <div key={m.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 13, fontWeight: 700 }}>{m.name}</div>
                  {m.score.map((s, i) => (
                    <div key={i} style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 13, fontWeight: 800, color: "var(--brand-dark, #B91414)" }}>
                      {s.team} {s.runs}/{s.wickets} ({s.overs})
                    </div>
                  ))}
                  <div style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 11, color: "#6b7280", marginTop: 2 }}>{m.status}</div>
                </div>
              ))}
            </div>
          )}

          {/* Trending */}
          <div className="cat-rail-head">ట్రెండింగ్</div>
          {trending.map((t, i) => (
            <Link
              key={t.id}
              href={`/article/${t.slug}`}
              style={{ display: "flex", gap: 10, padding: "11px 0", borderBottom: "1px dotted rgba(0,0,0,0.18)", textDecoration: "none" }}
            >
              <span style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 22, fontWeight: 700, color: "var(--brand, #E01B1B)", lineHeight: 1, flexShrink: 0 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h4 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 14, fontWeight: 700, lineHeight: 1.35, color: "var(--n-900, #111827)", margin: 0 }}>
                {t.title}
              </h4>
            </Link>
          ))}

          {/* Politics → cartoon */}
          {isPolitics && cartoon && (
            <div style={{ marginTop: 22 }}>
              <div className="cat-rail-head">ఎట్టెట</div>
              <img src={cartoon.imageUrl} alt={cartoon.title} loading="lazy" style={{ width: "100%", borderRadius: 4, border: "1px solid rgba(0,0,0,0.1)" }} />
              <div style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginTop: 6 }}>
                {cartoon.caption || cartoon.title}
              </div>
            </div>
          )}
        </aside>
      </main>

      <Footer config={config} />

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
          main { flex-direction: column !important; }
          aside { flex-basis: auto !important; }
        }
      `}</style>
    </div>
  );
}
