// /breaking-news - public list of active BREAKING_NEWS alerts. The masthead
// "Breaking" tile and (optionally) the ticker headlines link here. Each item
// is clickable into its full story when the editor set a link (payload.url);
// otherwise it's a headline-only alert. Layout: a list of alerts on the left
// with a sticky Trending rail on the right (same shape as the section hubs).

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { prisma } from "@rayalaseema/db";
import { getTrendingArticles } from "@/lib/db-queries";
import { articleHref } from "@/lib/article-href";

// Breaking news changes fast - revalidate often.
export const revalidate = 30;

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "బ్రేకింగ్ న్యూస్ | Breaking News - Rayalaseema News",
  description:
    "రాయలసీమ న్యూస్ తాజా బ్రేకింగ్ న్యూస్ అప్‌డేట్‌లు - రాయలసీమ, ఆంధ్రప్రదేశ్, జాతీయ ముఖ్యాంశాలు.",
  alternates: { canonical: `${SITE_URL}/breaking-news` },
};

function timeAgo(d: Date): string {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "ఇప్పుడే";
  if (m < 60) return `${m} నిమి. క్రితం`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} గం. క్రితం`;
  return `${Math.floor(h / 24)} రోజుల క్రితం`;
}

export default async function BreakingPage() {
  const now = new Date();
  const [rows, trending] = await Promise.all([
    prisma.content.findMany({
      where: { type: "BREAKING_NEWS", status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, createdAt: true, payload: true, featuredImage: true },
    }),
    getTrendingArticles(8),
  ]);

  const items = rows
    .map((r) => {
      const p = (r.payload as Record<string, unknown> | null) || {};
      const expiresAt = p.expiresAt ? new Date(p.expiresAt as string) : null;
      const url = typeof p.url === "string" && p.url.trim() ? p.url.trim() : null;
      const priority = typeof p.priority === "number" ? p.priority : 5;
      return { id: r.id, title: r.title, createdAt: r.createdAt, image: r.featuredImage, expiresAt, url, priority };
    })
    .filter((b) => !b.expiresAt || b.expiresAt > now)
    .sort((a, b) => a.priority - b.priority || b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 12px" }}>
        {/* Bilingual heading - Telugu + English (same as తాజా వార్తలు page) */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111" }}>బ్రేకింగ్ న్యూస్</h1>
          <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>Breaking News</span>
        </div>

        <div className="bn-layout">
          {/* LEFT - breaking alerts, priority/newest first */}
          <div className="bn-main">
            {items.length === 0 ? (
              <div className="bn-empty">
                <div className="bn-empty-ic" aria-hidden="true">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <h2 className="bn-empty-t">ప్రస్తుతం బ్రేకింగ్ న్యూస్ లేదు</h2>
                <p className="bn-empty-s">
                  ముఖ్యమైన అప్‌డేట్‌లు వచ్చిన వెంటనే ఇక్కడ కనిపిస్తాయి. అప్పటివరకు తాజా వార్తలు చదవండి.
                </p>
                <div className="bn-empty-cta">
                  <Button asChild size="lg" className="h-11 rounded-xl px-6 text-sm font-bold">
                    <Link href="/latest-news-list">తాజా వార్తలు చూడండి</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-11 rounded-xl px-6 text-sm font-bold">
                    <Link href="/">హోమ్‌కి వెళ్లండి</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bn-list">
                {items.map((item) => {
                  const inner = (
                    <>
                      <span className="bn-thumb">
                        {item.image ? (
                          <img src={item.image} alt="" loading="lazy" />
                        ) : (
                          <span className="bn-noimg"><img src="/logo-icon.png" alt="రాయలసీమ న్యూస్" loading="lazy" /></span>
                        )}
                      </span>
                      <span className="bn-body">
                        <span className="bn-meta">
                          <span className="bn-cat">బ్రేకింగ్</span>
                          <span className="bn-time">{timeAgo(item.createdAt)}</span>
                        </span>
                        <span className="bn-title">{item.title}</span>
                      </span>
                    </>
                  );
                  return (
                    <Link key={item.id} href={`/breaking-news/${item.id}`} className="bn-card bn-card--link">
                      {inner}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT - sticky Trending rail */}
          <aside className="bn-rail">
            <div className="bn-trend">
              <h2 className="bn-trend-h">ట్రెండింగ్ <span>Trending</span></h2>
              {trending.length === 0 ? (
                <p className="bn-trend-empty">వార్తలు ఏమీ లేవు.</p>
              ) : (
                <ol className="bn-trend-list">
                  {trending.map((t, i) => (
                    <li key={t.id}>
                      <Link href={articleHref(t as never)} className="bn-trend-row">
                        <span className={`bn-trend-num${i < 3 ? " is-top" : ""}`}>{String(i + 1).padStart(2, "0")}</span>
                        <span className="bn-trend-title">{t.title}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />

      <style>{`
        .bn-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 880px) { .bn-layout { grid-template-columns: 1fr; } }

        /* Breaking alert cards - same chrome as the తాజా వార్తలు (Latest News)
           cards: thumbnail on the left, heading on the right. */
        .bn-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        @media (max-width: 640px) { .bn-list { grid-template-columns: 1fr; } }
        .bn-card {
          display: flex; gap: 12px; padding: 10px;
          background: #fff; border: 1px solid #eef0f2; border-radius: 10px;
          text-decoration: none; transition: border-color 0.15s;
        }
        .bn-card--link:hover { border-color: #d1d5db; }
        .bn-thumb {
          flex: 0 0 116px; width: 116px; height: 80px; border-radius: 8px;
          overflow: hidden; background: #f3f4f6; display: block;
        }
        .bn-thumb > img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .bn-noimg {
          width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
          background: #f8fafc;
        }
        .bn-noimg img { width: 52px; height: auto; object-fit: contain; opacity: 0.6; }
        .bn-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .bn-meta { display: flex; align-items: center; gap: 8px; }
        .bn-cat {
          font-size: 10px; font-weight: 800; color: var(--brand, #E01B1B);
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .bn-time { font-size: 11px; font-weight: 600; color: #9ca3af; }
        .bn-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14.5px; font-weight: 700; line-height: 1.7; color: #111827;
        }
        .bn-card--link:hover .bn-title { color: var(--brand-dark, #B91414); }

        /* Trending rail */
        .bn-rail { position: sticky; top: 16px; }
        @media (max-width: 880px) { .bn-rail { position: static; } }
        .bn-trend { background: #fff; border: 1px solid #eef0f2; border-radius: 12px; padding: 16px; }
        .bn-trend-h {
          font-family: var(--font-telugu-heading), serif;
          font-size: 17px; font-weight: 800; color: #0f172a;
          padding-bottom: 10px; margin-bottom: 6px; border-bottom: 2px solid var(--brand, #E01B1B);
          display: flex; align-items: baseline; gap: 8px;
        }
        .bn-trend-h span { font-size: 12px; font-weight: 600; color: #94a3b8; }
        .bn-trend-list { list-style: none; margin: 0; padding: 0; }
        .bn-trend-row {
          display: flex; gap: 12px; align-items: flex-start;
          padding: 11px 0; border-bottom: 1px solid #f1f5f9; text-decoration: none;
        }
        .bn-trend-list li:last-child .bn-trend-row { border-bottom: none; }
        .bn-trend-num {
          flex-shrink: 0; width: 26px; text-align: center;
          font-family: system-ui, sans-serif; font-size: 18px; font-weight: 900; line-height: 1.4; color: #e2e8f0;
        }
        .bn-trend-num.is-top { color: var(--brand, #E01B1B); }
        .bn-trend-title {
          font-family: var(--font-telugu-body), sans-serif;
          font-size: 13.5px; font-weight: 600; line-height: 1.6; color: #334155;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .bn-trend-row:hover .bn-trend-title { color: var(--brand, #E01B1B); }
        .bn-trend-empty { font-size: 13px; color: #94a3b8; padding: 8px 0; }

        /* Empty state */
        .bn-empty {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          padding: 56px 24px 64px; margin-top: 4px;
          background: #fff; border: 1px solid #eef0f2; border-radius: 16px;
        }
        .bn-empty-ic {
          width: 88px; height: 88px; border-radius: 50%; margin-bottom: 22px;
          display: flex; align-items: center; justify-content: center;
          color: var(--brand, #E01B1B);
          background: linear-gradient(180deg, #fff5f5, #fee2e2);
          box-shadow: 0 10px 30px rgba(224,27,27,0.16), inset 0 0 0 1px rgba(224,27,27,0.06);
        }
        .bn-empty-t {
          font-family: var(--font-telugu-heading), serif;
          font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 8px;
        }
        .bn-empty-s {
          font-size: 13.5px; color: #64748b; line-height: 1.75;
          max-width: 380px; margin: 0 auto 24px;
        }
        .bn-empty-cta { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
      `}</style>
    </div>
  );
}
