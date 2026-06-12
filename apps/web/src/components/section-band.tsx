"use client";

import { articleHref } from "@/lib/article-href";
import { SectionHeading, sectionIcon } from "@/components/section-heading";
import Link from "next/link";
import { useState } from "react";
import { BandEmpty } from "@/components/band-empty";

interface BandArticle {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  featuredImage?: string | null;
  label?: string | null;
}

interface BandTrending {
  id: string;
  title: string;
  slug: string;
  publishedAt?: string | null;
}

interface BandPanel {
  // null lead = the filtered category is empty → render an "empty" state.
  lead: BandArticle | null;
  grid: BandArticle[];
  trending: BandTrending[];
}

interface BandTab {
  label: string;
  href: string;
  // When present, clicking the tab filters the band in place to this panel.
  // When null, the tab degrades to a plain navigation link (legacy behaviour).
  panel?: BandPanel | null;
}

interface BandMatch {
  id: string;
  name: string;
  status: string;
  teams: [string, string];
  score: { team: string; runs: number; wickets: number; overs: number }[];
  venue?: string;
  time?: string;
  isLive: boolean;
}

interface BandCartoon {
  title: string;
  caption: string;
  image: string;
  date: string;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ఇప్పుడే";
  if (m < 60) return `${m} నిమి.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} గం.`;
  return `${Math.floor(h / 24)} రోజులు`;
}

/**
 * Generic IE-style section band - lead story + hero image, 2x2 grid, trending rail.
 * Reused across Sports, Politics, and any future category section.
 */
export function SectionBand({
  brand,
  brandHref,
  tabs,
  trendingLabel = "ట్రెండింగ్",
  lead,
  grid,
  trending,
  scores,
  cartoon,
}: {
  brand: string;
  brandHref: string;
  tabs: BandTab[];
  trendingLabel?: string;
  lead: BandArticle;
  grid: BandArticle[];
  trending: BandTrending[];
  scores?: BandMatch[];
  cartoon?: BandCartoon | null;
}) {
  // null = show the band's own category (default). A number selects the tab
  // panel at that index. Tabs without a panel stay links and never set this.
  const [active, setActive] = useState<number | null>(null);
  const activePanel = active != null ? tabs[active]?.panel : null;
  const viewLead = activePanel ? activePanel.lead : lead;
  const viewGrid = activePanel ? activePanel.grid : grid;
  const viewTrending = activePanel ? activePanel.trending : trending;

  return (
    <section className="sb">
      <div className="sb-head">
        <SectionHeading
          title={brand}
          icon={sectionIcon(brandHref.replace(/^\//, "").split(/[?#]/)[0])}
          href={brandHref}
        />
        <nav className="sb-tabs">
          {tabs.map((t, i) =>
            t.panel ? (
              <button
                key={t.label}
                type="button"
                className={active === i ? "sb-tab sb-tab--active" : "sb-tab"}
                aria-pressed={active === i}
                // Click an active tab again to return to the default view.
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

      <div className="sb-body">
        <div className="sb-main">
          {viewLead ? (
          <>
          <div className="sb-lead">
            <div className="sb-lead-text">
              {viewLead.label && <span className="sb-kicker">{viewLead.label}</span>}
              <Link href={articleHref(viewLead)} className="sb-lead-link">
                <h3 className="sb-lead-title">{viewLead.title}</h3>
              </Link>
              {viewLead.summary && <p className="sb-lead-dek">{viewLead.summary}</p>}
            </div>
            <Link href={articleHref(viewLead)} className="sb-lead-img" aria-label={viewLead.title}>
              {viewLead.featuredImage ? (
                <img src={viewLead.featuredImage} alt={viewLead.title} loading="lazy" />
              ) : (
                <div className="sb-noimg"><img src="/logo-icon.png" alt="రాయలసీమ న్యూస్" loading="lazy" /></div>
              )}
            </Link>
          </div>

          <div className="sb-grid">
            {viewGrid.map((a) => (
              <Link key={a.id} href={articleHref(a)} className="sb-grid-item">
                <div className="sb-grid-text">
                  {a.label && <span className="sb-kicker">{a.label}</span>}
                  <h4 className="sb-grid-title">{a.title}</h4>
                </div>
                <div className="sb-grid-thumb">
                  {a.featuredImage ? (
                    <img src={a.featuredImage} alt={a.title} loading="lazy" />
                  ) : (
                    <div className="sb-noimg sb-noimg-sm"><img src="/logo-icon.png" alt="రాయలసీమ న్యూస్" loading="lazy" /></div>
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

        <aside className="sb-rail">
          {/* CRICKET - live scores when a match is on, else upcoming fixtures */}
          {scores && scores.length > 0 && (() => {
            const anyLive = scores.some((m) => m.isLive);
            return (
              <div className="sb-scores">
                <div className={`sb-rail-head${anyLive ? " sb-rail-head--live" : ""}`}>
                  {anyLive ? "లైవ్ స్కోర్" : "రాబోయే మ్యాచ్‌లు"}
                  {anyLive ? <span className="sb-live-dot" aria-hidden="true" /> : <span aria-hidden="true">›</span>}
                </div>
                {scores.map((m) => (
                  <div key={m.id} className="sb-match">
                    <div className="sb-match-name">{m.name}</div>
                    {m.score.length > 0 && (
                      <div className="sb-match-score">
                        {m.score.map((s, i) => (
                          <span key={i}>
                            {s.team} {s.runs}/{s.wickets} ({s.overs})
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="sb-match-status">{m.status}</div>
                    {m.time && <div className="sb-match-meta">🕒 {m.time}</div>}
                    {m.venue && <div className="sb-match-meta">📍 {m.venue}</div>}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* TRENDING */}
          <div className="sb-rail-head">
            {trendingLabel} <span aria-hidden="true">›</span>
          </div>
          {viewTrending.map((a, i) => (
            <Link key={a.id} href={articleHref(a)} className="sb-rail-item">
              <span className="sb-rail-num">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h4 className="sb-rail-title">{a.title}</h4>
                {timeAgo(a.publishedAt) && <span className="sb-rail-time">{timeAgo(a.publishedAt)}</span>}
              </div>
            </Link>
          ))}

          {/* CARTOON (politics) */}
          {cartoon && (
            <div className="sb-cartoon">
              <div className="sb-rail-head" style={{ marginTop: 18 }}>
                ఎట్టెట <span aria-hidden="true">›</span>
              </div>
              <img className="sb-cartoon-img" src={cartoon.image} alt={cartoon.title} loading="lazy" />
              <div className="sb-cartoon-cap">{cartoon.caption || cartoon.title}</div>
              <div className="sb-cartoon-date">{cartoon.date}</div>
            </div>
          )}
        </aside>
      </div>

      <style>{`
        /* Floating white card (BBC look): soft layered shadow instead of a hard
           border, rounder corners, and a touch more breathing room. */
        .sb {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.04);
          border-radius: 12px;
          padding: 18px 22px 22px;
          margin-top: 14px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 28px rgba(0,0,0,0.05);
        }
        /* Header: drop the heavy 2px black rule for a clean light divider - the
           red SectionHeading already carries the section identity. */
        .sb-head {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--n-200, #e5e7eb);
          margin-bottom: 18px;
        }
        .sb-brand {
          font-family: var(--font-telugu-heading), serif;
          font-size: 20px; font-weight: 800;
          color: var(--n-900, #111827);
          text-decoration: none;
        }
        .sb-brand span { color: var(--brand, #E01B1B); }
        /* Segmented-control tabs: a light track holding pill segments; the
           active segment is a white pill (lifted with a subtle shadow) with
           brand-red text. */
        .sb-tabs {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          background: var(--n-100, #f3f4f6);
          border-radius: 9px;
          padding: 3px;
          flex-wrap: wrap;
        }
        .sb-tabs a, .sb-tabs .sb-tab {
          -webkit-appearance: none;
          appearance: none;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 13px; font-weight: 700;
          color: var(--n-600, #4b5563);
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
        .sb-tabs a:hover, .sb-tabs .sb-tab:hover { color: var(--brand, #E01B1B); }
        .sb-tabs .sb-tab--active,
        .sb-tabs .sb-tab--active:hover {
          background: #fff;
          color: var(--brand, #E01B1B);
          box-shadow: 0 1px 2px rgba(0,0,0,0.14);
        }

        .sb-body { display: flex; gap: 24px; }
        .sb-main { flex: 1 1 auto; min-width: 0; }
        .sb-rail {
          flex: 0 0 260px;
          border-left: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
          padding-left: 20px;
        }

        .sb-kicker {
          display: inline-block;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 10px; font-weight: 800;
          color: var(--brand, #E01B1B);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 5px;
        }

        .sb-lead {
          display: flex; gap: 20px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.1));
        }
        .sb-lead-text { flex: 1 1 42%; min-width: 0; }
        .sb-lead-link { text-decoration: none; }
        .sb-lead-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 22px; font-weight: 800;
          line-height: 1.25;
          color: var(--n-900, #111827);
          margin: 0 0 8px;
        }
        .sb-lead-link:hover .sb-lead-title { color: var(--brand-dark, #B91414); }
        .sb-lead-dek {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 13px; line-height: 1.6;
          color: var(--n-600, #4b5563);
          margin: 0;
        }
        .sb-lead-img {
          flex: 1 1 58%;
          display: block; overflow: hidden;
          border-radius: 6px;
          /* Dark letterbox so the FULL image shows (no crop), matching the
             article page. object-fit:contain leaves bars - fill them black. */
          background: #000;
        }
        .sb-lead-img img {
          width: 100%; aspect-ratio: 16/10;
          object-fit: contain; display: block;
        }
        .sb-noimg {
          width: 100%; aspect-ratio: 16/10;
          display: flex; align-items: center; justify-content: center;
          background: var(--n-100, #f3f4f6);
        }
        .sb-noimg img { width: 24%; max-width: 88px; height: auto; object-fit: contain; opacity: 0.5; }
        .sb-noimg-sm { aspect-ratio: 1/1; }
        .sb-noimg-sm img { width: 44px; }

        .sb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
        .sb-grid-item {
          display: flex; gap: 12px;
          padding: 14px 16px;
          text-decoration: none;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.06));
          border-right: 1px solid var(--paper-edge, rgba(0,0,0,0.06));
          transition: background 0.15s ease;
        }
        .sb-grid-item:hover { background: var(--brand-soft, #FFF1F1); }
        .sb-grid-item:nth-child(2n) { border-right: none; padding-right: 0; }
        .sb-grid-item:nth-child(2n+1) { padding-left: 0; }
        .sb-grid-item:nth-child(n+3) { border-bottom: none; }
        .sb-grid-text { flex: 1 1 auto; min-width: 0; }
        .sb-grid-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 15px; font-weight: 700;
          line-height: 1.35;
          color: var(--n-900, #111827);
          margin: 0;
        }
        .sb-grid-item:hover .sb-grid-title { color: var(--brand-dark, #B91414); }
        .sb-grid-thumb {
          flex: 0 0 96px; height: 64px;
          overflow: hidden; border-radius: 6px;
          background: var(--n-100, #f3f4f6);
        }
        .sb-grid-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

        .sb-rail-head {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px; font-weight: 800;
          color: var(--n-900, #111827);
          padding-bottom: 8px;
          border-bottom: 2px solid var(--brand, #E01B1B);
          margin-bottom: 4px;
          display: flex; align-items: baseline; gap: 6px;
        }
        .sb-rail-head span { color: var(--brand, #E01B1B); }
        .sb-rail-item {
          display: flex; gap: 11px;
          text-decoration: none;
          padding: 11px 6px;
          margin: 0 -6px;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.07));
          border-radius: 6px;
          transition: background 0.15s ease;
        }
        .sb-rail-item:hover { background: var(--brand-soft, #FFF1F1); }
        .sb-rail-item:last-child { border-bottom: none; }
        .sb-rail-num {
          font-family: var(--font-telugu-heading), sans-serif;
          font-size: 23px; font-weight: 800;
          color: var(--brand, #E01B1B);
          line-height: 1; flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }
        .sb-rail-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14px; font-weight: 700;
          line-height: 1.35;
          color: var(--n-900, #111827);
          margin: 0;
        }
        .sb-rail-item:hover .sb-rail-title { color: var(--brand-dark, #B91414); }
        .sb-rail-time {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 10px; font-weight: 700;
          color: var(--n-500, #6b7280);
          text-transform: uppercase; letter-spacing: 0.04em;
        }

        /* LIVE SCORES */
        .sb-scores { margin-bottom: 18px; }
        .sb-rail-head--live { display: flex; align-items: center; gap: 8px; }
        .sb-live-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--brand, #E01B1B);
          animation: sbpulse 1.4s ease-in-out infinite;
        }
        @keyframes sbpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .sb-match {
          padding: 10px 0;
          border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
        }
        .sb-match:last-child { border-bottom: none; }
        .sb-match-name {
          font-family: var(--font-telugu-heading), serif;
          font-size: 13px; font-weight: 700;
          color: var(--n-900, #111827);
          line-height: 1.3;
        }
        .sb-match-score {
          display: flex; flex-direction: column; gap: 2px;
          margin-top: 4px;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 13px; font-weight: 800;
          color: var(--brand-dark, #B91414);
        }
        .sb-match-status {
          margin-top: 3px;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px;
          color: var(--n-500, #6b7280);
        }
        .sb-match-meta {
          margin-top: 2px;
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 10px;
          color: var(--n-500, #6b7280);
          line-height: 1.4;
        }

        /* CARTOON */
        .sb-cartoon-img {
          width: 100%;
          border-radius: 4px;
          display: block;
          margin-top: 4px;
          border: 1px solid var(--paper-edge, rgba(0,0,0,0.1));
        }
        .sb-cartoon-cap {
          font-family: var(--font-telugu-heading), serif;
          font-size: 13px; font-weight: 700;
          color: var(--n-900, #111827);
          line-height: 1.4;
          margin-top: 6px;
        }
        .sb-cartoon-date {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 11px;
          color: var(--n-500, #6b7280);
          margin-top: 3px;
        }

        @media (max-width: 1024px) {
          .sb-rail { flex-basis: 220px; }
          .sb-lead-title { font-size: 19px; }
        }
        @media (max-width: 768px) {
          .sb-body { flex-direction: column; gap: 16px; }
          .sb-rail {
            flex-basis: auto; border-left: none;
            border-top: 1px solid var(--paper-edge, rgba(0,0,0,0.08));
            padding-left: 0; padding-top: 12px;
          }
          .sb-lead { flex-direction: column; gap: 12px; }
          .sb-lead-text, .sb-lead-img { flex-basis: auto; }
          .sb-grid { grid-template-columns: 1fr; }
          .sb-grid-item {
            border-right: none !important;
            padding-left: 0 !important; padding-right: 0 !important;
            border-bottom: 1px solid var(--paper-edge, rgba(0,0,0,0.08)) !important;
          }
          .sb-grid-item:last-child { border-bottom: none !important; }
        }
      `}</style>
    </section>
  );
}
