// /breaking-news - public list of active BREAKING_NEWS alerts. The masthead
// "Breaking" tile and (optionally) the ticker headlines link here. Each item
// is clickable into its full story when the editor set a link (payload.url);
// otherwise it's a headline-only alert.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";
import { prisma } from "@rayalaseema/db";

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
  const rows = await prisma.content.findMany({
    where: { type: "BREAKING_NEWS", status: "PUBLISHED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, createdAt: true, payload: true },
  });

  const items = rows
    .map((r) => {
      const p = (r.payload as Record<string, unknown> | null) || {};
      const expiresAt = p.expiresAt ? new Date(p.expiresAt as string) : null;
      const url = typeof p.url === "string" && p.url.trim() ? p.url.trim() : null;
      const priority = typeof p.priority === "number" ? p.priority : 5;
      return { id: r.id, title: r.title, createdAt: r.createdAt, expiresAt, url, priority };
    })
    .filter((b) => !b.expiresAt || b.expiresAt > now)
    .sort((a, b) => a.priority - b.priority || b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="min-h-screen bg-gray-50">
      <SiteHeader />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "20px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ background: "#E01B1B", color: "#fff", fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif', fontWeight: 900, fontSize: 12, lineHeight: 1, padding: "6px 12px", borderRadius: 4, letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", display: "block", flexShrink: 0 }} className="animate-pulse" aria-hidden="true" />
            BREAKING
          </span>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111" }}>బ్రేకింగ్ న్యూస్</h1>
        </div>

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
            <style>{`
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
        ) : (
          <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", overflow: "hidden" }}>
            {items.map((item, i) => {
              const inner = (
                <div style={{ display: "flex", gap: 12, padding: "14px 16px", borderBottom: i < items.length - 1 ? "1px solid #f0f0f0" : "none", alignItems: "flex-start" }}>
                  <span style={{ color: "#E01B1B", fontWeight: 900, fontSize: 16, lineHeight: 1.6, flexShrink: 0 }} aria-hidden="true">●</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111", lineHeight: 1.5, margin: 0 }}>{item.title}</h2>
                    <span style={{ fontSize: 11, color: "#999" }}>{timeAgo(item.createdAt)}</span>
                  </div>
                  {item.url && <span style={{ color: "#E01B1B", fontSize: 18, flexShrink: 0, lineHeight: 1.5 }} aria-hidden="true">›</span>}
                </div>
              );
              return item.url ? (
                <Link key={item.id} href={item.url} style={{ textDecoration: "none", display: "block" }} className="hover:bg-gray-50">
                  {inner}
                </Link>
              ) : (
                <div key={item.id}>{inner}</div>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
