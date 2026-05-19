import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@rayalaseema/ui";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";
import { getTrendingArticles } from "@/lib/db-queries";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) return { title: "Category not found" };
  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  return {
    title: `${cat.name} - ${cat.nameEn} | రాయలసీమ ఎక్స్‌ప్రెస్`,
    description: cat.description || `${cat.name} - తాజా వార్తలు`,
    alternates: { canonical: `${siteUrl}/category/${slug}` },
    openGraph: { title: cat.name, url: `${siteUrl}/category/${slug}`, type: "website", locale: "te_IN" },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) return notFound();

  const [articles, trending] = await Promise.all([
    prisma.article.findMany({
      where: { status: "PUBLISHED", categoryId: category.id },
      include: { author: { select: { name: true } } },
      orderBy: { publishedAt: "desc" },
      take: 20,
    }),
    getTrendingArticles(8),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* Category Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #eee" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 12px" }}>
          <nav style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#888", marginBottom: 12 }}>
            <Link href="/" style={{ color: "#888", textDecoration: "none" }}>Home</Link>
            <span>/</span>
            <span style={{ color: "#333" }}>{category.name}</span>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 6, height: 36, borderRadius: 3, background: category.color || "#FF2C2C" }} />
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#000" }}>{category.name}</h1>
              <p style={{ fontSize: 13, color: "#888" }}>{category.nameEn} - {articles.length} articles</p>
            </div>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 12px" }}>
        <div style={{ display: "flex", gap: 24 }}>
          {/* Articles */}
          <div style={{ flex: 1 }}>
            {/* Featured first */}
            {articles[0] && (
              <Link href={`/article/${articles[0].slug}`} style={{ display: "block", marginBottom: 24, textDecoration: "none" }}>
                <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                  {articles[0].featuredImage && (
                    <img src={articles[0].featuredImage} alt={articles[0].title} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover" }} />
                  )}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20 }}>
                    <Badge color={category.color || "#FF2C2C"}>{category.name}</Badge>
                    <h2 style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginTop: 8, lineHeight: 1.4 }}>{articles[0].title}</h2>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginTop: 6 }}>{articles[0].summary}</p>
                  </div>
                </div>
              </Link>
            )}

            {/* Rest */}
            {articles.slice(1).map((article) => (
              <Link key={article.id} href={`/article/${article.slug}`} style={{ display: "flex", gap: 16, padding: "16px 0", borderBottom: "1px solid #f3f4f6", textDecoration: "none" }}>
                {article.featuredImage && (
                  <img src={article.featuredImage} alt="" style={{ width: 180, height: 120, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                )}
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: "#000", lineHeight: 1.5 }}>{article.title}</h3>
                  <p style={{ fontSize: 14, color: "#666", marginTop: 6, lineHeight: 1.6 }}>{article.summary}</p>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 12, color: "#888" }}>
                    <span>{article.author.name}</span>
                    <span>|</span>
                    <span>{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString("te-IN") : ""}</span>
                    <span>|</span>
                    <span>{article.viewCount.toLocaleString()} views</span>
                  </div>
                </div>
              </Link>
            ))}

            {articles.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#888" }}>
                <p style={{ fontSize: 16 }}>No articles in this category yet</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside style={{ width: 320, flexShrink: 0 }}>
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", padding: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-brand)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--color-brand)" }}>
                Trending
              </h3>
              {trending.map((t, i) => (
                <Link key={t.id} href={`/article/${t.slug}`} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f5", textDecoration: "none" }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: i < 3 ? "var(--color-brand)" : "#ddd", width: 28, flexShrink: 0 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#111", lineHeight: 1.5 }}>{t.title}</p>
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
