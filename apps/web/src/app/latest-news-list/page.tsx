// /latest-news-list - Eenadu-style "తాజా వార్తలు" feed: the most recent
// published articles, newest first, with thumbnails + timestamps. The masthead
// "Latest" tile links here. Links go through articleHref (canonical /telugu-news/).

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";

export const revalidate = 60; // refresh the feed every minute

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "తాజా వార్తలు | Latest News - Rayalaseema News",
  description:
    "రాయలసీమ న్యూస్ తాజా వార్తలు - రాయలసీమ, ఆంధ్రప్రదేశ్, జాతీయ, అంతర్జాతీయ, క్రీడలు, సినిమా తాజా అప్‌డేట్‌లు.",
  alternates: { canonical: `${SITE_URL}/latest-news-list` },
};

export default async function LatestNewsListPage() {
  const rows = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 48,
    select: {
      id: true,
      title: true,
      slug: true,
      featuredImage: true,
      publishedAt: true,
      category: { select: { name: true, slug: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111" }}>తాజా వార్తలు</h1>
          <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600 }}>Latest News</span>
        </div>

        {rows.length === 0 ? (
          <p style={{ color: "#666", padding: "48px 0", textAlign: "center" }}>వార్తలు ఏమీ లేవు.</p>
        ) : (
          <div className="lnl-grid">
            {rows.map((a) => (
              <Link key={a.id} href={articleHref(a as never)} className="lnl-card">
                <span className="lnl-thumb">
                  {a.featuredImage ? (
                    <img src={a.featuredImage} alt="" loading="lazy" />
                  ) : (
                    <span className="lnl-noimg">RE</span>
                  )}
                </span>
                <span className="lnl-body">
                  <span className="lnl-meta">
                    {a.category?.name && <span className="lnl-cat">{a.category.name}</span>}
                  </span>
                  <span className="lnl-title">{a.title}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />

      <style>{`
        .lnl-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
        @media (max-width: 640px) { .lnl-grid { grid-template-columns: 1fr; } }
        .lnl-card {
          display: flex; gap: 12px; padding: 10px;
          background: #fff; border: 1px solid #eef0f2; border-radius: 10px;
          text-decoration: none; transition: border-color 0.15s;
        }
        .lnl-card:hover { border-color: #d1d5db; }
        .lnl-thumb {
          flex: 0 0 116px; width: 116px; height: 80px; border-radius: 8px;
          overflow: hidden; background: #f3f4f6; display: block;
        }
        .lnl-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .lnl-noimg {
          width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
          font-family: var(--font-telugu-heading), serif; font-weight: 800; font-size: 18px; color: #cbd5e1;
        }
        .lnl-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .lnl-meta { display: flex; align-items: center; gap: 8px; }
        .lnl-cat {
          font-size: 10px; font-weight: 800; color: var(--brand, #E01B1B);
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .lnl-title {
          font-family: var(--font-telugu-heading), serif;
          font-size: 14.5px; font-weight: 700; line-height: 1.7; color: #111827;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
        .lnl-card:hover .lnl-title { color: var(--brand-dark, #B91414); }
      `}</style>
    </div>
  );
}
