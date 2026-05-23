import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@rayalaseema/ui";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { TTSButton } from "@/components/tts-button";
import { CommentsSection } from "@/components/comments-section";
import { ScrollShareNudge } from "@/components/scroll-share-nudge";
import { ShareBar } from "@/components/share-bar";
import { getArticleBySlug, getTrendingArticles, getArticlesByCategory, incrementViewCount } from "@/lib/db-queries";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: "Not found" };
  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  // Per-article SEO overrides w/ sensible fallbacks
  const metaTitle = (article as any).metaTitle || article.title;
  const metaDescription = (article as any).metaDescription || article.summary || article.title;
  const ogImage = (article as any).ogImage || article.featuredImage || `${siteUrl}/logo-transparent.svg`;
  const canonical = `${siteUrl}/article/${slug}`;
  const noindex = article.status !== "PUBLISHED";
  return {
    title: `${metaTitle} | రాయలసీమ ఎక్స్‌ప్రెస్`,
    description: metaDescription,
    alternates: {
      canonical,
      types: { "text/html+amp": `${canonical}/amp` }, // Google AMP discovery
    },
    robots: noindex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: metaTitle,
      description: metaDescription,
      url: canonical,
      type: "article",
      locale: "te_IN",
      images: ogImage ? [{ url: ogImage }] : undefined,
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt?.toISOString(),
      authors: [article.desk?.name ?? article.author.name],
    },
    twitter: {
      card: "summary_large_image",
      title: metaTitle,
      description: metaDescription,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

function sanitizeHtml(html: string): string {
  // Remove script tags, event handlers, and dangerous attributes
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "");
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) return notFound();

  // P1 #9 — bump view count on every render (fire-and-forget; uses Prisma increment, race-safe)
  incrementViewCount(article.id).catch(() => {});

  const [trending, related] = await Promise.all([
    getTrendingArticles(8),
    getArticlesByCategory(article.category.slug, 4),
  ]);

  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.summary || "",
    image: article.featuredImage || undefined,
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt?.toISOString(),
    // Desk byline is treated as an Organization for schema.org; falls back to the
    // individual author's Person name only if the article wasn't assigned a desk
    // (shouldn't happen for new articles — auto-resolver always assigns one).
    author: article.desk
      ? { "@type": "Organization", name: article.desk.name }
      : { "@type": "Person", name: article.author.name },
    publisher: {
      "@type": "Organization",
      name: "Rayalaseema Express",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo-transparent.svg` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${siteUrl}/article/${slug}` },
    articleSection: article.category.nameEn,
    inLanguage: "te",
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: article.category.name, item: `${siteUrl}/category/${article.category.slug}` },
      { "@type": "ListItem", position: 3, name: article.title },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <ScrollShareNudge title={article.title} slug={slug} />
      <Header />

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 12px" }}>
        {/* Breadcrumb */}
        <nav style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#888", marginBottom: 16 }}>
          <Link href="/" style={{ color: "#888", textDecoration: "none" }}>Home</Link>
          <span>/</span>
          <Link href={`/category/${article.category.slug}`} style={{ color: "#888", textDecoration: "none" }}>{article.category.name}</Link>
          <span>/</span>
          <span style={{ color: "#555" }}>{article.title.substring(0, 40)}...</span>
        </nav>

        <div className="article-layout" style={{ display: "flex", gap: 24 }}>
          {/* Article Content */}
          <article style={{ flex: 1, minWidth: 0 }}>
            {/* Category badge */}
            <Badge color={article.category.color || "#FF2C2C"}>{article.category.name}</Badge>

            {/* Title */}
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#000", lineHeight: 1.4, marginTop: 10 }}>
              {article.title}
            </h1>

            {/* Byline — desk name (Telugu) is primary; English subtitle + date below.
                Falls back to author for old articles that pre-date the desk system. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
              <div>
                <div style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 15, fontWeight: 800, color: "#1a1a1a" }}>
                  {article.desk?.name ?? article.author.name}
                </div>
                <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {article.desk?.nameEn && <span>{article.desk.nameEn} · </span>}
                  {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("te-IN", { day: "numeric", month: "long", year: "numeric" }) : ""}
                </p>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>
                {article.viewCount.toLocaleString()} views
              </div>
            </div>

            {/* TTS + Share */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
              <TTSButton text={article.body || ""} />
            </div>
            <ShareBar
              title={article.title}
              slug={slug}
              siteUrl={siteUrl}
              body={article.body || ""}
              featuredImage={article.featuredImage}
              deskName={article.desk?.name ?? null}
            />

            {/* Featured Image */}
            {article.featuredImage && (
              <div style={{ marginTop: 20 }}>
                <img src={article.featuredImage} alt={article.title} style={{ width: "100%", borderRadius: 8, maxHeight: 500, objectFit: "cover" }} />
                {article.imageCaption && <p style={{ fontSize: 12, color: "#888", marginTop: 6, fontStyle: "italic" }}>{article.imageCaption}</p>}
              </div>
            )}

            {/* Article Body */}
            <div
              className="article-body"
              style={{ marginTop: 24 }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.body) }}
            />

            {/* Tags */}
            {article.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24, paddingTop: 16, borderTop: "1px solid #eee" }}>
                <span style={{ fontSize: 13, color: "#888" }}>Tags:</span>
                {article.tags.map((t) => (
                  <Link key={t.tag.slug} href={`/tag/${t.tag.slug}`} style={{ padding: "4px 12px", background: "#f3f4f6", borderRadius: 20, fontSize: 12, color: "#555", textDecoration: "none" }}>
                    #{t.tag.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Related Articles */}
            {related.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: "#000", marginBottom: 16, paddingBottom: 8, borderBottom: "2px solid var(--color-brand)" }}>
                  Related Articles
                </h3>
                <div className="related-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {related.filter((r) => r.slug !== slug).slice(0, 4).map((r) => (
                    <Link key={r.id} href={`/article/${r.slug}`} style={{ display: "flex", gap: 10, textDecoration: "none" }}>
                      {r.featuredImage && (
                        <img src={r.featuredImage} alt="" style={{ width: 100, height: 70, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      )}
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#111", lineHeight: 1.5 }}>{r.title}</p>
                        <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                          {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString("te-IN") : ""}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {/* Comments */}
            <CommentsSection articleId={article.id} />
          </article>

          {/* Sidebar */}
          <aside className="article-sidebar" style={{ width: 320, flexShrink: 0 }}>
            {/* Trending */}
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", padding: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-brand)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--color-brand)" }}>
                Trending
              </h3>
              {trending.map((t, i) => (
                <Link key={t.id} href={`/article/${t.slug}`} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f5", textDecoration: "none" }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: i < 3 ? "var(--color-brand)" : "#ddd", width: 28, flexShrink: 0 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#111", lineHeight: 1.5 }}>{t.title}</p>
                    <p style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{t.viewCount.toLocaleString()} views</p>
                  </div>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}
