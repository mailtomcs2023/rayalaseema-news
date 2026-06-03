// Spec #4 K2 (#247) - /mandi-prices page.
//
// Single canonical URL using the existing MandiPrice model. Filter by
// commodity + market name client-side; daily-updated server-side.

import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

export const revalidate = 1800; // 30 min - mandi prices update once or twice a day

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "Today's mandi prices - Rayalaseema News",
  description:
    "Latest commodity prices from Andhra Pradesh mandis. Chilli, cotton, turmeric, paddy, groundnut, maize, tomato, onion rates from major Rayalaseema markets. Updated daily.",
  alternates: { canonical: `${SITE_URL}/mandi-prices` },
  openGraph: {
    title: "Today's mandi prices | Rayalaseema News",
    description: "Daily commodity rates from AP mandis.",
    url: `${SITE_URL}/mandi-prices`,
    type: "website",
    locale: "te_IN",
  },
};

export default async function MandiPricesPage() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.mandiPrice.findMany({
    where: { active: true, date: { gte: yesterday } },
    orderBy: [{ commodity: "asc" }, { market: "asc" }, { date: "desc" }],
  });

  type Row = typeof rows[number];
  const byCommodity = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.commodityEn;
    if (!byCommodity.has(key)) byCommodity.set(key, []);
    byCommodity.get(key)!.push(r);
  }

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Today's mandi prices" }],
  });
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: "Today's mandi prices across Rayalaseema markets",
    description: "Latest commodity prices - chilli, cotton, turmeric, paddy, groundnut, maize, tomato, onion - from major AP mandis.",
    datePublished: rows[0]?.date.toISOString() || new Date().toISOString(),
    dateModified: rows[0]?.date.toISOString() || new Date().toISOString(),
    publisher: { "@type": "NewsMediaOrganization", name: "Rayalaseema News", url: SITE_URL },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/mandi-prices` },
    inLanguage: "te",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(articleLd as any) }} />
      <SiteHeader />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 16px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#111", marginBottom: 4 }}>
          Today's mandi prices
        </h1>
        <p style={{ fontSize: 14, color: "#888", marginBottom: 24 }}>
          ఈరోజు మండీ ధరలు · Updated {rows[0]?.date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) || "-"}
        </p>

        {byCommodity.size === 0 ? (
          <p style={{ fontSize: 14, color: "#888", padding: 24, textAlign: "center", background: "#fff", borderRadius: 8 }}>
            No mandi prices uploaded for today. Check back after 11am IST.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {[...byCommodity.entries()].map(([commodity, list]) => (
              <div key={commodity} style={{ background: "#fff", borderRadius: 10, padding: 18, border: "1px solid #e5e7eb" }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 4 }}>
                  {list[0].commodity} <span style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>· {commodity}</span>
                </h2>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginTop: 6 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ textAlign: "left", padding: "6px 8px", color: "#666" }}>Market</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "#666" }}>{list[0].unit}</th>
                      <th style={{ textAlign: "right", padding: "6px 8px", color: "#666" }}>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "8px" }}>
                          {r.market} <span style={{ color: "#888", fontSize: 12 }}>({r.marketEn})</span>
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                          ₹{r.price.toLocaleString("en-IN")}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", color: r.change > 0 ? "#16a34a" : r.change < 0 ? "#dc2626" : "#888" }}>
                          {r.change > 0 ? "+" : ""}{r.change.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 12, color: "#888", marginTop: 24, lineHeight: 1.6 }}>
          Prices are wholesale arrivals per quintal at the named mandi. Retail prices vary. Source: editorial desk
          + agmarknet.gov.in.
        </p>
      </main>
      <Footer />
    </div>
  );
}
