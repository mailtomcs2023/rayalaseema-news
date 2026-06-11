// Shared "section hub" layout - the /kurnool district-page design (header →
// lead + 2-col grid + rest list → sticky Trending rail). Extracted so both the
// district hubs (DistrictView) and slug-driven category hubs that want the same
// look (e.g. the జిల్లా వార్తలు / district-news category) render identical markup
// instead of duplicating ~150 lines of JSX + inline styles.

import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";
import { articleHref } from "@/lib/article-href";

// slug is nullable to match the Prisma row shape both callers select; articleHref
// already tolerates a null slug (falls back to the id-based permalink).
export interface HubArticle {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  featuredImage: string | null;
  category: { name: string; slug: string } | null;
}

// Only the fields the rail + articleHref need; callers pass richer rows (extra
// props are fine since these are query results, not object literals).
export interface HubTrending {
  id: string;
  title: string;
  viewCount: number;
  slug: string | null;
}

export interface SectionHubProps {
  // Site config for the shared header/footer.
  config: any;
  // Active section slug - drives the primary-nav highlight + (for districts)
  // the constituency secondary sub-nav. Categories simply won't have one.
  slug: string;
  // Header block.
  title: string;
  subtitle?: string | null;
  // Breadcrumb leaf name (Home › <breadcrumbName>).
  breadcrumbName: string;
  // Optional amber notice above the list (district "coming soon" fallback).
  banner?: string | null;
  // Section name woven into the empty state (defaults to the title).
  emptyLabel?: string | null;
  articles: HubArticle[];
  trending: HubTrending[];
  siteUrl: string;
}

export function SectionHub({
  config,
  slug,
  title,
  subtitle,
  breadcrumbName,
  banner,
  emptyLabel,
  articles,
  trending,
  siteUrl,
}: SectionHubProps) {
  const lead = articles[0];
  const below = articles.slice(1);
  const isEmpty = articles.length === 0;

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: siteUrl }, { name: breadcrumbName }],
  });

  return (
    <div className="min-h-screen" style={{ background: "#fff" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <SiteHeader config={config} breakingNews={[]} activeSectionSlug={slug} />

      {/* Section header - "Telugu - English" on one line. Font sizes unchanged:
          Telugu big, English small/grey, separated by a dash. */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 12px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 26, fontWeight: 800, color: "var(--n-900, #111827)" }}>
            {title}
          </span>
          {subtitle && (
            <span style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 12, color: "#6b7280" }}>
              - {subtitle}
            </span>
          )}
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 12px 48px" }}>
        {banner && (
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
            {banner}
          </div>
        )}

        {isEmpty ? (
          /* Creative, warm empty state for a section with no stories yet. */
          <div className="hub-empty">
            <div className="hub-empty-badge" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z" />
              </svg>
            </div>
            <h2 className="hub-empty-title">మీ కోసం {emptyLabel || title} కథనాలు సిద్ధమవుతున్నాయి</h2>
            <p className="hub-empty-msg">
              మీరు ఇక్కడిదాకా రావడం మాకెంతో ఆనందం. 🙏
              <br />
              ప్రస్తుతం ఈ విభాగంలో కథనాలు లేవు - కానీ మీ నమ్మకాన్ని నిలబెట్టేలా,
              హృదయపూర్వకంగా రాసిన నాణ్యమైన వార్తలతో మీ కోసం త్వరలో తిరిగి వస్తాం.
            </p>
            <div className="hub-empty-actions">
              <Link href="/" className="hub-empty-btn hub-empty-btn--primary">హోమ్‌కు వెళ్లండి</Link>
              <Link href="/latest-news-list" className="hub-empty-btn">తాజా వార్తలు చూడండి</Link>
            </div>
          </div>
        ) : (
        <div style={{ display: "flex", gap: 28 }}>
          {/* MAIN */}
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            {lead && (
              <Link href={articleHref(lead)} className="hub-lead">
                {lead.featuredImage && (
                  <div className="hub-lead-img">
                    <img src={lead.featuredImage} alt={lead.title} />
                  </div>
                )}
                <div className="hub-lead-text">
                  <h1 className="hub-lead-title">{lead.title}</h1>
                  {lead.summary && <p className="hub-lead-dek">{lead.summary}</p>}
                </div>
              </Link>
            )}

            {/* Articles under the lead: 2-col card grid - red category kicker +
                bold title on the left, thumbnail on the right, pink hover.
                Matches the section-band design used across the site. */}
            {below.length > 0 && (
              <div className="hub-grid">
                {below.map((a) => (
                  <Link key={a.id} href={articleHref(a)} className="hub-grid-item">
                    <div className="hub-grid-text">
                      {a.category?.name && <span className="hub-kicker">{a.category.name}</span>}
                      <h3 className="hub-grid-title">{a.title}</h3>
                    </div>
                    <div className="hub-grid-thumb">
                      {a.featuredImage ? (
                        <img src={a.featuredImage} alt={a.title} loading="lazy" />
                      ) : (
                        <div className="hub-noimg-sm"><img src="/logo-icon.png" alt="Rayalaseema News" loading="lazy" /></div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* RAIL - sticky Trending, same card UI as the article page.
              Hidden when this section has no trending stories of its own.
              top:96 clears the sticky primary nav (40px) + secondary header (40px). */}
          {trending.length > 0 && (
            <aside style={{ flex: "0 0 290px", position: "sticky", top: 96, alignSelf: "flex-start", maxHeight: "calc(100vh - 112px)", overflowY: "auto" }}>
              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", padding: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-brand)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--color-brand)" }}>
                  Trending
                </h3>
                {trending.map((t, i) => (
                  <Link key={t.id} href={articleHref(t as any)} className="hub-rail-item">
                    <span className="hub-rail-num" style={{ color: i < 3 ? "var(--color-brand)" : "#ddd" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="hub-rail-title">{t.title}</p>
                      <p className="hub-rail-views">{t.viewCount.toLocaleString()} views</p>
                    </div>
                  </Link>
                ))}
              </div>
            </aside>
          )}
        </div>
        )}
      </main>

      <SiteFooter config={config} />

      <style>{`
        /* Creative empty state - warm, branded, centred card. */
        .hub-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 56px 24px 64px;
          background: linear-gradient(180deg, var(--brand-soft, #FFF1F1) 0%, #ffffff 78%);
          border: 1px solid rgba(224, 27, 27, 0.12);
          border-radius: 16px;
          margin-top: 4px;
        }
        .hub-empty-badge {
          width: 76px;
          height: 76px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--brand, #E01B1B);
          background: #fff;
          box-shadow: 0 6px 18px rgba(224, 27, 27, 0.16);
          margin-bottom: 18px;
        }
        .hub-empty-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 22px;
          font-weight: 800;
          color: var(--n-900, #111827);
          margin: 0 0 10px;
          line-height: 1.35;
        }
        .hub-empty-msg {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 14.5px;
          line-height: 1.8;
          color: var(--n-600, #4b5563);
          margin: 0 0 22px;
          max-width: 440px;
        }
        .hub-empty-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
        .hub-empty-btn {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 13.5px;
          font-weight: 700;
          padding: 10px 22px;
          border-radius: 999px;
          text-decoration: none;
          border: 1px solid rgba(224, 27, 27, 0.3);
          color: var(--brand, #E01B1B);
          background: #fff;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .hub-empty-btn:hover { background: var(--brand-soft, #FFF1F1); }
        .hub-empty-btn--primary {
          background: var(--brand, #E01B1B);
          color: #fff;
          border-color: var(--brand, #E01B1B);
        }
        .hub-empty-btn--primary:hover { background: var(--brand-dark, #B91414); color: #fff; }

        /* Lead story: image on the LEFT, headline + summary on the RIGHT. */
        .hub-lead {
          display: flex;
          gap: 20px;
          text-decoration: none;
          margin-bottom: 18px;
          align-items: flex-start;
        }
        .hub-lead-img {
          flex: 1 1 56%;
          min-width: 0;
          overflow: hidden;
          border-radius: 6px;
          background: #000;
        }
        .hub-lead-img img {
          width: 100%;
          aspect-ratio: 16/10;
          object-fit: cover;
          display: block;
        }
        .hub-lead-text { flex: 1 1 44%; min-width: 0; }
        .hub-lead-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 24px;
          font-weight: 800;
          line-height: 1.3;
          color: var(--n-900, #111827);
          margin: 0 0 10px;
        }
        .hub-lead:hover .hub-lead-title { color: var(--brand-dark, #B91414); }
        .hub-lead-dek {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #4b5563;
          margin: 0;
        }

        /* Trending rail items: pink hover, title turns brand-red, lift cursor. */
        .hub-rail-item {
          display: flex;
          gap: 8px;
          padding: 8px 6px;
          margin: 0 -6px;
          border-bottom: 1px solid #f5f5f5;
          border-radius: 6px;
          text-decoration: none;
          transition: background 0.15s ease;
        }
        .hub-rail-item:last-child { border-bottom: none; }
        .hub-rail-item:hover { background: var(--brand-soft, #FFF1F1); }
        .hub-rail-num {
          font-size: 20px;
          font-weight: 900;
          width: 28px;
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }
        .hub-rail-title {
          font-size: 13px;
          font-weight: 700;
          color: #111;
          line-height: 1.5;
          margin: 0;
          transition: color 0.15s ease;
        }
        .hub-rail-item:hover .hub-rail-title { color: var(--brand-dark, #B91414); }
        .hub-rail-views { font-size: 11px; color: #888; margin: 2px 0 0; }

        /* 2-col card grid under the lead (section-band look): kicker + title on
           the left, thumbnail on the right, dividers between cells, pink hover. */
        .hub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
        .hub-grid-item {
          display: flex; gap: 12px;
          padding: 14px 16px;
          text-decoration: none;
          border-bottom: 1px solid rgba(0,0,0,0.06);
          border-right: 1px solid rgba(0,0,0,0.06);
          transition: background 0.15s ease;
        }
        .hub-grid-item:hover { background: var(--brand-soft, #FFF1F1); }
        .hub-grid-item:nth-child(2n) { border-right: none; padding-right: 0; }
        .hub-grid-item:nth-child(2n+1) { padding-left: 0; }
        .hub-grid-text { flex: 1 1 auto; min-width: 0; }
        .hub-kicker {
          display: inline-block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 10px; font-weight: 800;
          color: var(--brand, #E01B1B);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 5px;
        }
        .hub-grid-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 15px; font-weight: 700;
          line-height: 1.35;
          color: var(--n-900, #111827);
          margin: 0;
        }
        .hub-grid-item:hover .hub-grid-title { color: var(--brand-dark, #B91414); }
        .hub-grid-thumb {
          flex: 0 0 96px; height: 64px;
          overflow: hidden; border-radius: 6px;
          background: var(--n-100, #f3f4f6);
        }
        .hub-grid-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .hub-noimg-sm {
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          background: var(--n-50, #f9fafb);
        }
        .hub-noimg-sm img { width: auto; height: 34px; object-fit: contain; opacity: 0.6; }

        @media (max-width: 900px) {
          main > div { flex-direction: column !important; }
          aside { flex-basis: auto !important; }
        }
        @media (max-width: 768px) {
          .hub-lead { flex-direction: column; gap: 12px; }
          .hub-lead-img, .hub-lead-text { flex-basis: auto; }
          .hub-grid { grid-template-columns: 1fr; }
          .hub-grid-item {
            border-right: none !important;
            padding-left: 0 !important; padding-right: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
