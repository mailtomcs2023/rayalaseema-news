"use client";

import { articleHref } from "@/lib/article-href";
import Link from "next/link";
import { useState } from "react";
import { BandEmpty } from "@/components/band-empty";

interface CinemaArticle {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  featuredImage?: string | null;
  label?: string | null;
}

interface CinemaReview {
  id: string;
  title: string;
  slug: string;
  reviewerName?: string | null;
  rating?: number | null;
}

interface CinemaPanel {
  // null lead = the filtered sub-genre is empty → render an "empty" state.
  lead: CinemaArticle | null;
  grid: CinemaArticle[];
}

interface CinemaTab {
  label: string;
  href: string;
  // When present, the tab filters the band in place to this sub-genre.
  // When null, it degrades to a plain link to the /cinema?t= page.
  panel?: CinemaPanel | null;
}

// Render 5 stars from a 0-5 float (full / half / empty).
function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, rating));
  return (
    <span className="cb-stars" aria-label={`${r} out of 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, r - i)); // 0, 0.5-ish, or 1
        return (
          <span key={i} className="cb-star">
            <span className="cb-star-bg">★</span>
            <span className="cb-star-fg" style={{ width: `${fill * 100}%` }}>★</span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * IE-Screen-style cinema band - Tollywood-first for a Telugu audience.
 * Red branded header + tabs, lead story + hero image, 2x2 grid, movie-review rail with stars.
 */
export function CinemaBand({
  lead,
  grid,
  reviews,
  tabs = [],
}: {
  lead: CinemaArticle;
  grid: CinemaArticle[];
  reviews: CinemaReview[];
  tabs?: CinemaTab[];
}) {
  // null = default సినిమా view. A number selects a sub-genre tab panel.
  const [active, setActive] = useState<number | null>(null);
  const activePanel = active != null ? tabs[active]?.panel : null;
  const viewLead = activePanel ? activePanel.lead : lead;
  const viewGrid = activePanel ? activePanel.grid : grid;

  return (
    <section className="cb">
      {/* Branded header */}
      <div className="cb-head">
        <Link href="/cinema" className="cb-brand">సినిమా</Link>
        <nav className="cb-tabs">
          {tabs.map((t, i) =>
            t.panel ? (
              <button
                key={t.label}
                type="button"
                className={active === i ? "cb-tab cb-tab--active" : "cb-tab"}
                aria-pressed={active === i}
                onClick={() => setActive(active === i ? null : i)}
              >
                {t.label}
              </button>
            ) : (
              <Link key={t.label} href={t.href}>{t.label}</Link>
            ),
          )}
        </nav>
      </div>

      <div className="cb-body">
        {/* MAIN */}
        <div className="cb-main">
          {viewLead ? (
          <>
          {/* LEAD */}
          <div className="cb-lead">
            <div className="cb-lead-text">
              {viewLead.label && <span className="cb-kicker">{viewLead.label}</span>}
              <Link href={articleHref(viewLead)} className="cb-lead-link">
                <h3 className="cb-lead-title">{viewLead.title}</h3>
              </Link>
              {viewLead.summary && <p className="cb-lead-dek">{viewLead.summary}</p>}
            </div>
            <Link href={articleHref(viewLead)} className="cb-lead-img" aria-label={viewLead.title}>
              {viewLead.featuredImage ? (
                <img src={viewLead.featuredImage} alt={viewLead.title} loading="lazy" />
              ) : (
                <div className="cb-noimg">RE</div>
              )}
            </Link>
          </div>

          {/* 2x2 GRID */}
          <div className="cb-grid">
            {viewGrid.map((a) => (
              <Link key={a.id} href={articleHref(a)} className="cb-grid-item">
                <div className="cb-grid-text">
                  {a.label && <span className="cb-kicker">{a.label}</span>}
                  <h4 className="cb-grid-title">{a.title}</h4>
                </div>
                <div className="cb-grid-thumb">
                  {a.featuredImage ? (
                    <img src={a.featuredImage} alt={a.title} loading="lazy" />
                  ) : (
                    <div className="cb-noimg cb-noimg-sm">RE</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
          </>
          ) : (
            <BandEmpty />
          )}
        </div>

        {/* REVIEW RAIL */}
        <aside className="cb-rail">
          <div className="cb-rail-head">
            మూవీ రివ్యూ <span aria-hidden="true">›</span>
          </div>
          {reviews.map((rv) => (
            <Link key={rv.id} href={articleHref(rv)} className="cb-rail-item">
              <h4 className="cb-rail-title">{rv.title}</h4>
              <div className="cb-rail-meta">
                {rv.reviewerName && <span className="cb-reviewer">{rv.reviewerName}</span>}
                {typeof rv.rating === "number" && <Stars rating={rv.rating} />}
              </div>
            </Link>
          ))}
        </aside>
      </div>

      <style>{`
        .cb {
          background: #fff;
          border: 1px solid var(--paper-edge, rgba(0,0,0,0.06));
          border-radius: 8px;
          overflow: hidden;
          margin-top: 8px;
        }
        /* HEADER */
        .cb-head {
          background: var(--brand, #E01B1B);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 18px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .cb-brand {
          font-family: var(--font-telugu-heading), serif;
          font-size: 22px;
          font-weight: 800;
          color: #fff;
          text-decoration: none;
          letter-spacing: 0.02em;
        }
        /* Segmented-control tabs: a translucent track holding pill segments;
           the active segment is a solid white pill with brand-red text. */
        .cb-tabs {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          /* Darker overlay on the brand-red bar so the white tab labels
             clear WCAG AA 4.5:1 contrast (PSI flagged the previous
             rgba(255,255,255,0.16) - that lightened the bar to
             ~rgb(229,63,63) and the white text only hit ~3.7:1). */
          background: rgba(0,0,0,0.28);
          border-radius: 9px;
          padding: 3px;
          flex-wrap: wrap;
        }
        .cb-tabs a, .cb-tabs .cb-tab {
          -webkit-appearance: none;
          appearance: none;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          text-decoration: none;
          /* Asymmetric vertical padding nudges the label down ~3px to optically
             center it - Noto Sans Telugu reserves large descent space, so a
             symmetric box leaves the visible glyphs sitting high. */
          padding: 8px 15px 2px;
          margin: 0;
          border: none;
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
          line-height: 1;
          white-space: nowrap;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .cb-tabs a:hover, .cb-tabs .cb-tab:hover { background: rgba(255,255,255,0.12); }
        .cb-tabs .cb-tab--active,
        .cb-tabs .cb-tab--active:hover {
          background: #fff;
          color: var(--brand, #E01B1B);
        }

        .cb-body { display: flex; gap: 24px; padding: 16px 18px 18px; }
        .cb-main { flex: 1 1 auto; min-width: 0; }
        .cb-rail {
          flex: 0 0 250px;
          border-left: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
          padding-left: 20px;
        }

        .cb-kicker {
          display: inline-block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 10px;
          font-weight: 800;
          color: var(--brand, #E01B1B);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 5px;
        }

        /* LEAD */
        .cb-lead {
          display: flex;
          gap: 20px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.1));
        }
        .cb-lead-text { flex: 1 1 42%; min-width: 0; }
        .cb-lead-link { text-decoration: none; }
        .cb-lead-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 22px;
          font-weight: 800;
          line-height: 1.25;
          color: var(--n-900, #111827);
          margin: 0 0 8px;
        }
        .cb-lead-link:hover .cb-lead-title { color: var(--brand-dark, #B91414); }
        .cb-lead-dek {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 13px;
          line-height: 1.6;
          color: var(--n-600, #4b5563);
          margin: 0;
        }
        .cb-lead-img {
          flex: 1 1 58%;
          display: block;
          overflow: hidden;
          border-radius: 4px;
          /* Dark letterbox so the FULL poster shows (no crop), matching the
             article page. object-fit:contain leaves side/top bars - fill them
             with black for a cinematic look. */
          background: #000;
        }
        .cb-lead-img img {
          width: 100%;
          aspect-ratio: 16/10;
          object-fit: contain;
          display: block;
        }
        .cb-noimg {
          width: 100%;
          aspect-ratio: 16/10;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-telugu-heading), serif;
          font-weight: 800; font-size: 32px;
          color: var(--n-300, #d1d5db);
        }
        .cb-noimg-sm { font-size: 16px; aspect-ratio: 1/1; }

        /* 2x2 GRID */
        .cb-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
        }
        .cb-grid-item {
          display: flex;
          gap: 12px;
          padding: 14px 16px;
          text-decoration: none;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
          border-right: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
        }
        .cb-grid-item:nth-child(2n) { border-right: none; padding-right: 0; }
        .cb-grid-item:nth-child(2n+1) { padding-left: 0; }
        .cb-grid-item:nth-child(n+3) { border-bottom: none; }
        .cb-grid-text { flex: 1 1 auto; min-width: 0; }
        .cb-grid-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.35;
          color: var(--n-900, #111827);
          margin: 0;
        }
        .cb-grid-item:hover .cb-grid-title { color: var(--brand-dark, #B91414); }
        .cb-grid-thumb {
          flex: 0 0 96px;
          height: 64px;
          overflow: hidden;
          border-radius: 4px;
          background: var(--n-100, #f3f4f6);
        }
        .cb-grid-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

        /* REVIEW RAIL */
        .cb-rail-head {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px;
          font-weight: 800;
          color: var(--n-900, #111827);
          padding-bottom: 8px;
          border-bottom: 2px solid var(--n-900, #111827);
          margin-bottom: 4px;
          display: flex; align-items: baseline; gap: 6px;
        }
        .cb-rail-head span { color: var(--brand, #E01B1B); }
        .cb-rail-item {
          display: block;
          text-decoration: none;
          padding: 11px 0;
          border-bottom: 1px dotted var(--paper-edge, rgba(0,0,0,0.18));
        }
        .cb-rail-item:last-child { border-bottom: none; }
        .cb-rail-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 15px;
          font-weight: 700;
          line-height: 1.3;
          color: var(--n-900, #111827);
          margin: 0 0 4px;
        }
        .cb-rail-item:hover .cb-rail-title { color: var(--brand-dark, #B91414); }
        .cb-rail-meta { display: flex; align-items: center; gap: 8px; }
        .cb-reviewer {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px;
          color: var(--n-500, #6b7280);
        }

        /* STARS */
        .cb-stars { display: inline-flex; gap: 1px; }
        .cb-star {
          position: relative;
          display: inline-block;
          font-size: 13px;
          line-height: 1;
        }
        .cb-star-bg { color: var(--n-200, #e5e7eb); }
        .cb-star-fg {
          position: absolute;
          left: 0; top: 0;
          overflow: hidden;
          color: #F5A623;
          white-space: nowrap;
        }

        @media (max-width: 1024px) {
          .cb-rail { flex-basis: 220px; }
          .cb-lead-title { font-size: 19px; }
        }
        @media (max-width: 768px) {
          .cb-body { flex-direction: column; gap: 16px; }
          .cb-rail {
            flex-basis: auto; border-left: none;
            border-top: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
            padding-left: 0; padding-top: 12px;
          }
          .cb-lead { flex-direction: column; gap: 12px; }
          .cb-lead-text, .cb-lead-img { flex-basis: auto; }
          .cb-grid { grid-template-columns: 1fr; }
          .cb-grid-item {
            border-right: none !important;
            padding-left: 0 !important; padding-right: 0 !important;
            border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08)) !important;
          }
          .cb-grid-item:last-child { border-bottom: none !important; }
        }
      `}</style>
    </section>
  );
}
