import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@rayalaseema/db";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { getSiteConfig } from "@/lib/db-queries";
import type { Metadata } from "next";
import { articleHref } from "@/lib/article-href";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tag = await prisma.tag.findUnique({ where: { slug } });
  if (!tag) return { title: "Tag not found" };
  const siteUrl = process.env.SITE_URL || "https://rayalaseemaexpress.com";
  return {
    title: `${tag.name} | రాయలసీమ ఎక్స్‌ప్రెస్`,
    description: `${tag.name} - తాజా వార్తలు, విశ్లేషణలు`,
    alternates: { canonical: `${siteUrl}/tag/${slug}` },
    openGraph: {
      title: tag.name,
      url: `${siteUrl}/tag/${slug}`,
      type: "website",
    },
  };
}

export default async function TagPage({ params }: Props) {
  const { slug } = await params;
  // Spec #1 #189: Tag → Content is now via the `contentTags` join table.
  // We fetch the tag for its name + the joined Content rows in parallel.
  const [tag, contentTags] = await Promise.all([
    prisma.tag.findUnique({ where: { slug } }),
    prisma.contentTag.findMany({
      where: { tag: { slug }, content: { status: "PUBLISHED" } },
      include: {
        content: {
          include: {
            category: { select: { name: true, slug: true, color: true } },
            author: { select: { name: true } },
          },
        },
      },
      orderBy: { content: { publishedAt: "desc" } },
      take: 60,
    }),
  ]);

  if (!tag) notFound();

  const config = await getSiteConfig();
  const articles = contentTags.map((ct) => ct.content);

  return (
    <div style={{ minHeight: "100vh", background: "var(--page-bg, #f6f6f6)" }}>
      <Header config={config} />
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "var(--sp-5, 24px) var(--sp-4, 16px)" }}>
        {/* Tag header */}
        <div style={{ padding: "var(--sp-4, 16px) 0 var(--sp-5, 24px)", borderBottom: "1px solid var(--paper-edge, rgba(0,0,0,0.08))", marginBottom: "var(--sp-5, 24px)" }}>
          <span style={{ display: "block", width: 32, height: 3, background: "var(--brand, #E01B1B)", marginBottom: 8 }} />
          <p style={{ fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>TAG</p>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: "#111", lineHeight: 1.2 }}>#{tag.name}</h1>
          <p style={{ fontSize: 14, color: "#666", marginTop: 8 }}>{articles.length} articles</p>
        </div>

        {/* Articles list */}
        {articles.length === 0 ? (
          <p style={{ fontSize: 14, color: "#888", padding: 24, textAlign: "center" }}>No articles with this tag yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {articles.map((a) => (
              <Link
                key={a.id}
                href={articleHref(a)}
                className="category-card"
                style={{ display: "flex", flexDirection: "column", textDecoration: "none", color: "inherit" }}
              >
                {a.featuredImage && (
                  <img src={a.featuredImage} alt={a.title} loading="lazy" decoding="async"
                    style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }} />
                )}
                <div style={{ padding: 16 }}>
                  <span style={{
                    display: "inline-block", fontSize: 11, fontWeight: 700, color: "#fff",
                    background: a.category?.color || "var(--brand)", padding: "2px 8px", borderRadius: 4,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    {a.category?.name ?? ""}
                  </span>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", lineHeight: 1.35, marginTop: 8 }}>
                    {a.title}
                  </h2>
                  {a.summary && (
                    <p style={{ fontSize: 14, color: "#555", lineHeight: 1.5, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                      {a.summary}
                    </p>
                  )}
                  <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
                    {a.author?.name ?? ""} · {a.publishedAt && new Date(a.publishedAt).toLocaleDateString("te-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer config={config} />
    </div>
  );
}
