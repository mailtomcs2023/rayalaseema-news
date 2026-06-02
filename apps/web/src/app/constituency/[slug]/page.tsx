import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";
import { buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";
import { articleHref } from "@/lib/article-href";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const constituency = await prisma.constituency.findUnique({
    where: { slug },
    include: { district: true },
  });
  if (!constituency) return { title: "Constituency not found" };
  const siteUrl = process.env.SITE_URL || "https://rayalaseemanews.com";
  const title = `${constituency.nameEn} Constituency News - ${constituency.name} వార్తలు`;
  const description = `${constituency.nameEn} (${constituency.name}) నియోజకవర్గం నుండి తాజా వార్తలు, రాజకీయాలు, MLA, అభివృద్ధి కార్యక్రమాలు. ${constituency.district.nameEn} district. Latest political + civic news from Rayalaseema News.`;
  return {
    title,
    description,
    keywords: [
      `${constituency.nameEn} constituency`,
      `${constituency.nameEn} news`,
      `${constituency.nameEn} MLA`,
      `${constituency.nameEn} election`,
      `${constituency.name} నియోజకవర్గం`,
      `${constituency.name} వార్తలు`,
      `${constituency.district.nameEn} ${constituency.nameEn}`,
      `${constituency.district.nameEn} news`,
      "rayalaseema news",
      "andhra pradesh politics",
    ],
    alternates: { canonical: `${siteUrl}/constituency/${slug}` },
    openGraph: {
      title,
      description,
      url: `${siteUrl}/constituency/${slug}`,
      type: "website",
      locale: "te_IN",
      siteName: "Rayalaseema News",
    },
  };
}

export default async function ConstituencyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const constituency = await prisma.constituency.findUnique({
    where: { slug },
    include: {
      district: true,
      mandals: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!constituency) return notFound();

  const articles = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED", constituencyId: constituency.id },
    include: {
      category: { select: { name: true, color: true } },
      author: { select: { name: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });

  const siteUrl = process.env.SITE_URL || "https://rayalaseemanews.com";
  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: siteUrl },
      { name: constituency.district.name, url: `${siteUrl}/district/${constituency.district.slug}` },
      { name: constituency.name },
    ],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <Header />

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "3px solid var(--color-brand)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 12px" }}>
          <nav style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
            <Link href="/" style={{ color: "#888", textDecoration: "none" }}>Home</Link>
            <span> / </span>
            <Link href={`/district/${constituency.district.slug}`} style={{ color: "#888", textDecoration: "none" }}>{constituency.district.name}</Link>
            <span> / </span>
            <span style={{ color: "#333" }}>{constituency.name}</span>
          </nav>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "var(--color-brand)" }}>{constituency.name}</h1>
          <p style={{ fontSize: 14, color: "#888", marginTop: 4 }}>
            {constituency.nameEn} | {constituency.district.nameEn} District | {constituency.mandals.length} Mandals | Lok Sabha: {constituency.loksabha}
          </p>

          {/* Mandal pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {constituency.mandals.map((m) => (
              <span key={m.id} style={{ padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 600, background: "#f3f4f6", color: "#555", border: "1px solid #e5e7eb" }}>
                {m.nameEn}
              </span>
            ))}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 12px" }}>
        {articles.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {articles.map((article) => (
              <Link key={article.id} href={articleHref(article)} style={{ textDecoration: "none" }}>
                <div style={{ background: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #eee" }}>
                  {article.featuredImage && (
                    <img src={article.featuredImage} alt="" style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover" }} />
                  )}
                  <div style={{ padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                      <svg width="12" height="12" fill="var(--color-brand)" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--color-brand)" }}>
                        {constituency.nameEn}
                      </span>
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: "#000", lineHeight: 1.5 }}>{article.title}</h3>
                    <p style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
                      {article.author.name} | {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("te-IN") : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 10, border: "1px solid #eee" }}>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#333" }}>{constituency.name} వార్తలు త్వరలో...</p>
            <p style={{ fontSize: 14, color: "#888", marginTop: 8 }}>No articles tagged to this constituency yet. Articles will appear here when reporters tag them to this location.</p>
            <Link href={`/district/${constituency.district.slug}`} style={{ display: "inline-block", marginTop: 16, padding: "10px 24px", background: "var(--color-brand)", color: "#fff", borderRadius: 8, fontWeight: 700, textDecoration: "none" }}>
              Back to {constituency.district.name}
            </Link>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
