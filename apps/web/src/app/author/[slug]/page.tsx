import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { prisma } from "@rayalaseema/db";
import { articleHref } from "@/lib/article-href";
import { buildPersonSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

// Phase A2 (#193) — route now keys on User.publicProfileSlug, not User.id.
// Old /author/<cuid> URLs return 404 (clean cutover; same approach as A0 article
// migration since the old URLs had no GSC equity to preserve).
async function fetchAuthor(slug: string) {
  return prisma.user.findFirst({
    where: { publicProfileSlug: slug, active: true },
    select: {
      id: true, name: true, bio: true, avatar: true, role: true,
      publicProfileSlug: true, twitterHandle: true, linkedinUrl: true,
      facebookUrl: true, expertise: true, affiliations: true, yearsExperience: true,
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const author = await fetchAuthor(slug);
  if (!author) return { title: "Author not found" };
  return {
    title: `${author.name} | Rayalaseema Express`,
    description: author.bio || `${author.name}, ${author.role} at Rayalaseema Express. Read all articles by ${author.name}.`,
    alternates: { canonical: `${SITE_URL}/author/${author.publicProfileSlug}` },
    openGraph: {
      title: author.name,
      description: author.bio || undefined,
      url: `${SITE_URL}/author/${author.publicProfileSlug}`,
      type: "profile",
      locale: "te_IN",
      images: author.avatar ? [{ url: author.avatar }] : undefined,
    },
  };
}

const ARTICLES_PER_PAGE = 30;

export default async function AuthorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  // Spec #4 F5 (#229) — pagination via ?page=N (1-indexed). Cap at the
  // floor of count / ARTICLES_PER_PAGE so deep ?page numbers don't fall
  // through to empty pages with no canonical signal.
  const sp = (await searchParams) || {};
  const pageRaw = Number(sp.page ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const author = await fetchAuthor(slug);
  if (!author) return notFound();

  const totalArticles = await prisma.content.count({
    where: { type: "ARTICLE", authorId: author.id, status: "PUBLISHED" },
  });
  const totalPages = Math.max(1, Math.ceil(totalArticles / ARTICLES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const articles = await prisma.content.findMany({
    where: { type: "ARTICLE", authorId: author.id, status: "PUBLISHED" },
    include: {
      category: { select: { name: true, nameEn: true, slug: true, color: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    skip: (currentPage - 1) * ARTICLES_PER_PAGE,
    take: ARTICLES_PER_PAGE,
  });

  // Person JSON-LD via shared generator (Phase B4 #200). Sidebar pills below
  // also need the visible sameAs list; compute it once.
  const sameAs = [
    author.twitterHandle ? `https://twitter.com/${author.twitterHandle.replace(/^@/, "")}` : null,
    author.linkedinUrl || null,
    author.facebookUrl || null,
  ].filter((u): u is string => Boolean(u));
  const personLd = buildPersonSchema({
    author: {
      name: author.name,
      publicProfileSlug: author.publicProfileSlug || "author",
      role: author.role,
      bio: author.bio,
      avatar: author.avatar,
      twitterHandle: author.twitterHandle,
      linkedinUrl: author.linkedinUrl,
      facebookUrl: author.facebookUrl,
      expertise: author.expertise,
      affiliations: author.affiliations,
    },
    publisher: {
      siteUrl: SITE_URL,
      publicationName: "Rayalaseema Express",
      publicationNameTe: "రాయలసీమ ఎక్స్‌ప్రెస్",
      logoUrl: `${SITE_URL}/logo.png`,
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(personLd) }} />
      <Header />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "30px 16px" }}>
        {/* Author Card */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: 24, display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%", background: "var(--color-brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 32, fontWeight: 900, flexShrink: 0,
            overflow: "hidden",
          }}>
            {author.avatar ? (
              <img src={author.avatar} alt={author.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              author.name.charAt(0)
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>{author.name}</h1>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 4,
              background: author.role === "ADMIN" ? "#fef3c7" : author.role !== "REPORTER" ? "#dbeafe" : "#dcfce7",
              color: author.role === "ADMIN" ? "#92400e" : author.role !== "REPORTER" ? "#1e40af" : "#166534",
            }}>
              {author.role}
            </span>
            {author.bio && <p style={{ fontSize: 14, color: "#666", marginTop: 8, lineHeight: 1.7 }}>{author.bio}</p>}
            {author.expertise.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {author.expertise.map((tag) => (
                  <span key={tag} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: "#f3f4f6", color: "#555" }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {sameAs.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {sameAs.map((url) => {
                  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })();
                  return (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer me"
                       style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: "#eef2ff", color: "#3730a3", textDecoration: "none" }}>
                      {host}
                    </a>
                  );
                })}
              </div>
            )}
            <p style={{ fontSize: 13, color: "#888", marginTop: 6 }}>{totalArticles} articles published</p>
          </div>
        </div>

        {/* Articles */}
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: "#111" }}>
          Published Articles
          {totalArticles > ARTICLES_PER_PAGE && (
            <span style={{ fontSize: 13, fontWeight: 500, color: "#888", marginLeft: 8 }}>
              · Page {currentPage} of {totalPages}
            </span>
          )}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {articles.map((a) => (
            <Link key={a.id} href={articleHref(a)} style={{ textDecoration: "none" }}>
              <div style={{
                background: "#fff", borderRadius: 8, padding: "12px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                display: "flex", alignItems: "center", gap: 14, transition: "box-shadow 0.15s",
              }} className="hover:shadow-md">
                {a.featuredImage && (
                  <img src={a.featuredImage} alt="" style={{ width: 80, height: 55, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</h3>
                  <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", background: a.category?.color || "#888", padding: "1px 6px", borderRadius: 3 }}>
                      {a.category?.nameEn ?? a.category?.name ?? ""}
                    </span>
                    <span style={{ fontSize: 11, color: "#888" }}>
                      {a.publishedAt ? new Date(a.publishedAt).toLocaleDateString("te-IN") : ""}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Pagination (F5 #229). Hide when single page; emit prev/next links
            with rel=prev/next semantics so crawlers walk the archive. */}
        {totalPages > 1 && (
          <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, gap: 12 }}>
            {currentPage > 1 ? (
              <a
                href={`/author/${author.publicProfileSlug}${currentPage > 2 ? `?page=${currentPage - 1}` : ""}`}
                rel="prev"
                style={{ padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 6, color: "var(--color-brand)", textDecoration: "none", fontSize: 14 }}
              >
                ← Previous
              </a>
            ) : <span />}
            <span style={{ fontSize: 13, color: "#666" }}>
              {totalArticles} total · showing {ARTICLES_PER_PAGE * (currentPage - 1) + 1}–{Math.min(ARTICLES_PER_PAGE * currentPage, totalArticles)}
            </span>
            {currentPage < totalPages ? (
              <a
                href={`/author/${author.publicProfileSlug}?page=${currentPage + 1}`}
                rel="next"
                style={{ padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 6, color: "var(--color-brand)", textDecoration: "none", fontSize: 14 }}
              >
                Next →
              </a>
            ) : <span />}
          </nav>
        )}
      </main>
      <Footer />
    </div>
  );
}
