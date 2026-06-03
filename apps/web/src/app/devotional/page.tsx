// Spec #4 K3 (#248) - /devotional hub.
//
// Single canonical URL collecting Tirumala-Tirupati Devasthanams (TTD)
// news + Hindu festival schedules + temple-town stories. Articles
// surface by Category.slug = "devotional" + cross-listings.

import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

export const revalidate = 600;

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

export const metadata: Metadata = {
  title: "Devotional news - Tirumala, Tirupati, AP temples | Rayalaseema News",
  description:
    "TTD news, seva booking updates, festival schedules, and devotional stories from across Andhra Pradesh's temple towns. Tirumala, Tirupati, Srisailam, Kanipakam and more.",
  alternates: { canonical: `${SITE_URL}/devotional` },
  openGraph: {
    title: "Devotional news | రాయలసీమ న్యూస్ - భక్తి",
    url: `${SITE_URL}/devotional`,
    type: "website",
    locale: "te_IN",
  },
};

export default async function DevotionalPage() {
  const category = await prisma.category.findUnique({
    where: { slug: "devotional" },
    select: { id: true, name: true, nameEn: true, description: true },
  });

  const articles = category
    ? await prisma.content.findMany({
        where: { type: "ARTICLE", status: "PUBLISHED", categoryId: category.id },
        include: {
          category: { select: { name: true, nameEn: true, slug: true, color: true } },
          constituency: { select: { slug: true, district: { select: { slug: true } } } },
        },
        orderBy: { publishedAt: "desc" },
        take: 30,
      })
    : [];

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [{ name: "Home", url: SITE_URL }, { name: "Devotional" }],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <SiteHeader />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "30px 16px" }}>
        <header style={{ marginBottom: 18, paddingBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: "#111" }}>{category?.name || "భక్తి"}</h1>
          <p style={{ fontSize: 14, color: "#888", marginTop: 4 }}>
            Devotional · TTD news, seva schedules, temple stories from Andhra Pradesh
          </p>
          {category?.description && (
            <p style={{ fontSize: 15, color: "#444", marginTop: 8, lineHeight: 1.7, maxWidth: 720 }}>
              {category.description}
            </p>
          )}
        </header>

        {articles.length === 0 ? (
          <p style={{ fontSize: 14, color: "#888", padding: 24, textAlign: "center" }}>
            No devotional articles yet - check back shortly.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {articles.map((a) => (
              <Link key={a.id} href={articleHref(a)} style={{ textDecoration: "none" }}>
                <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #eee" }}>
                  {a.featuredImage && (
                    <img src={a.featuredImage} alt="" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover" }} loading="lazy" />
                  )}
                  <div style={{ padding: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: "#000", lineHeight: 1.5 }}>{a.title}</h3>
                    <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                      {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("te-IN") : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
