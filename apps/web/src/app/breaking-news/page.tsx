// /breaking-news - public list of active BREAKING_NEWS alerts. The masthead
// "Breaking" tile and (optionally) the ticker headlines link here. Each item
// is clickable into its full story when the editor set a link (payload.url);
// otherwise it's a headline-only alert.

import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
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
          <span style={{ background: "#E01B1B", color: "#fff", fontWeight: 900, fontSize: 12, padding: "5px 12px", borderRadius: 4, letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", display: "inline-block" }} className="animate-pulse" aria-hidden="true" />
            BREAKING
          </span>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111" }}>బ్రేకింగ్ న్యూస్</h1>
        </div>

        {items.length === 0 ? (
          <p style={{ color: "#666", padding: "48px 0", textAlign: "center", fontSize: 15 }}>
            ప్రస్తుతం బ్రేకింగ్ న్యూస్ ఏమీ లేదు.
          </p>
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
