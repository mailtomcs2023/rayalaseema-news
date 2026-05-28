// Spec #4 K1 (#246) - /gold-rate page.
//
// Single canonical URL. Daily-updated table of gold + silver rates across
// the Telugu commerce cities we cover. NOT geo-fanout (no per-mandal
// pages) - gold price is essentially the same across cities, with a tiny
// makig-charge / GST delta. Editor populates rows from
// SiteConfig.precious_metal_source (admin UI in a follow-up).

import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

export const revalidate = 600; // 10 min - rates only update a few times a day

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

export const metadata: Metadata = {
  title: "Gold rate today in Andhra Pradesh - Rayalaseema Express News",
  description:
    "Today's gold and silver rates in Hyderabad, Vijayawada, Tirupati, Kurnool, Anantapuramu, Kadapa, Nellore, Chittoor. 22K + 24K gold + silver per gram. Updated daily.",
  alternates: { canonical: `${SITE_URL}/gold-rate` },
  openGraph: {
    title: "Gold rate today | Rayalaseema Express News",
    description: "Daily-updated gold and silver rates across Telugu cities.",
    url: `${SITE_URL}/gold-rate`,
    type: "website",
    locale: "te_IN",
  },
};

export default async function GoldRatePage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Latest row per (metal, city, purity) within the current 24h window.
  const rows = await prisma.preciousMetalRate.findMany({
    where: { active: true, date: { gte: new Date(today.getTime() - 24 * 60 * 60 * 1000) } },
    orderBy: [{ city: "asc" }, { metal: "asc" }, { purity: "asc" }, { date: "desc" }],
  });

  // Group rows for display: per city → metals.
  type Row = typeof rows[number];
  const byCity = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byCity.has(r.city)) byCity.set(r.city, []);
    byCity.get(r.city)!.push(r);
  }

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Gold rate today" }],
  });
  // NewsArticle-shaped JSON-LD so AI engines treat this as a fresh daily story.
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: "Today's gold and silver rates across Telugu cities",
    description: "Daily-updated gold (22K + 24K) and silver rates per gram in Hyderabad, Vijayawada, Tirupati, Kurnool, Anantapuramu, Kadapa, Nellore, and Chittoor.",
    datePublished: rows[0]?.date.toISOString() || new Date().toISOString(),
    dateModified: rows[0]?.date.toISOString() || new Date().toISOString(),
    publisher: { "@type": "NewsMediaOrganization", name: "Rayalaseema Express News", url: SITE_URL },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/gold-rate` },
    inLanguage: "te",
  };

  const formatPrice = (r: Row) => `₹${r.pricePerGram.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(articleLd as any) }} />
      <Header />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#111", marginBottom: 4 }}>
          Gold &amp; silver rates today
        </h1>
        <p style={{ fontSize: 14, color: "#888", marginBottom: 24 }}>
          ఈరోజు బంగారం, వెండి ధరలు · Updated {rows[0]?.date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) || "-"}
        </p>

        {byCity.size === 0 ? (
          <p style={{ fontSize: 14, color: "#888", padding: 24, textAlign: "center", background: "#fff", borderRadius: 8 }}>
            Rates are being updated. Check back shortly.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {[...byCity.entries()].map(([city, list]) => (
              <div key={city} style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e5e7eb" }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 }}>
                  {list[0].cityTe ? `${list[0].cityTe} (${city})` : city}
                </h2>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "6px 8px", color: "#666" }}>Metal</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", color: "#666" }}>Purity</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "#666" }}>{list[0].unit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px", fontWeight: 600 }}>{r.metal === "GOLD" ? "Gold" : "Silver"}</td>
                        <td style={{ padding: "8px" }}>{r.purity || "-"}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{formatPrice(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 12, color: "#888", marginTop: 24, lineHeight: 1.6 }}>
          Rates shown here are indicative wholesale rates; jeweller showroom prices vary by ~3-8% for making charges + GST.
          Source: editorial desk · {rows[0]?.source || "-"}.
        </p>
      </main>
      <Footer />
    </div>
  );
}
