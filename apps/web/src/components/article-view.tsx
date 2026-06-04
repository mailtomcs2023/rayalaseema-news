// Shared article-detail body, rendered by both the legacy /article/[slug]
// route and the new /[district]/[constituency]/[slugid] + /news/[slugid]
// routes (Phase A0 URL migration). Pure server component - no client state.

import Link from "next/link";
import Image from "next/image";
import { Badge } from "@rayalaseema/ui";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TTSButton } from "@/components/tts-button";
import { CommentsSection } from "@/components/comments-section";
import { ScrollShareNudge } from "@/components/scroll-share-nudge";
import { ShareBar } from "@/components/share-bar";
import { DialectGlosser } from "@/components/dialect-glosser";
import { injectInlineByline, formatRelativeTelugu } from "@/lib/byline";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { categoryHref } from "@/lib/category-href";
import { articleHref } from "@/lib/article-href";
import { buildNewsArticleSchema, buildBreadcrumbListSchema, stringifyJsonLd } from "@rayalaseema/seo-schema";
import type { LocationChain, AuthorRef, PublisherConfig } from "@rayalaseema/seo-schema";

// Convert a YouTube watch / share / shorts URL into its privacy-friendly embed
// URL. Returns null for non-YouTube URLs (hosted MP4 / Azure Blob), which fall
// through to a native <video> player.
function ytEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

// Loose type - matches the projected shape returned by
// getArticleBySlug + getTrendingArticles + getArticlesByCategory in db-queries.
// Components never read every field; we accept anything that has the keys we
// touch and let TypeScript widen elsewhere.
type ArticleLike = {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  body: string | null;
  featuredImage: string | null;
  featuredVideo?: string | null;
  imageCaption?: string | null;
  publishedAt: Date | null;
  updatedAt: Date | null;
  viewCount: number;
  category: { name: string; slug: string; color?: string | null };
  author: { id?: string; name: string };
  desk?: { name: string } | null;
  tags: { tag: { slug: string; name: string } }[];
  constituency?: { slug: string; district: { slug: string } } | null;
};

type Related = {
  id: string;
  slug: string | null;
  title: string;
  featuredImage: string | null;
  publishedAt: Date | null;
  constituency?: { slug: string; district: { slug: string } } | null;
};

type Trending = {
  id: string;
  slug: string | null;
  title: string;
  viewCount: number;
  constituency?: { slug: string; district: { slug: string } } | null;
};

interface Props {
  article: ArticleLike;
  related: Related[];
  trending: Trending[];
  siteUrl: string;
}

export function ArticleView({ article, related, trending, siteUrl }: Props) {
  const canonical = `${siteUrl}${articleHref(article)}`;
  // Cast widens to the post-A2/A3 author + constituency shape that
  // getArticleBySlug now returns (publicProfileSlug, social fields, lat/lng
  // on district/constituency). ArticleLike stays loose to support older
  // callers that pass partial shapes.
  const a = article as any;
  const newsArticleLd = buildNewsArticleSchema({
    article: {
      id: article.id,
      slug: article.slug || "",
      title: article.title,
      summary: article.summary,
      body: article.body,
      featuredImage: article.featuredImage,
      publishedAt: article.publishedAt,
      updatedAt: article.updatedAt,
      articleSection: a.category?.nameEn || article.category.name,
      // Spec #4 brand disambiguation + AI-search keyword signal. Tags + the
      // category English name fed in as a comma-joined keyword list - AI
      // engines (Perplexity / ChatGPT / Gemini) read it; Google doesn't but
      // ignores it harmlessly.
      keywords: [
        ...(article.tags || []).map((t) => t.tag.name),
        a.category?.nameEn,
        a.category?.name,
      ].filter((s): s is string => Boolean(s)),
    },
    author: {
      name: article.author.name,
      publicProfileSlug: a.author?.publicProfileSlug || a.author?.id || "author",
      role: a.author?.role ?? null,
      bio: a.author?.bio ?? null,
      avatar: a.author?.avatar ?? null,
      twitterHandle: a.author?.twitterHandle ?? null,
      linkedinUrl: a.author?.linkedinUrl ?? null,
      facebookUrl: a.author?.facebookUrl ?? null,
      expertise: a.author?.expertise ?? [],
      affiliations: a.author?.affiliations ?? [],
    } satisfies AuthorRef,
    publisher: {
      siteUrl,
      publicationName: "Rayalaseema News",
      publicationNameTe: "రాయలసీమ న్యూస్",
      logoUrl: `${siteUrl}/logo.png`,
    } satisfies PublisherConfig,
    locationChain: a.constituency
      ? ({
          district: {
            name: a.constituency.district?.name ?? "",
            nameEn: a.constituency.district?.nameEn ?? "",
            slug: a.constituency.district?.slug ?? "",
            lat: a.constituency.district?.lat ?? null,
            lng: a.constituency.district?.lng ?? null,
          },
          constituency: {
            name: a.constituency.name ?? "",
            nameEn: a.constituency.nameEn ?? "",
            slug: a.constituency.slug,
            lat: a.constituency.lat ?? null,
            lng: a.constituency.lng ?? null,
          },
        } satisfies LocationChain)
      : null,
    canonicalUrl: canonical,
    images: article.featuredImage,
  });

  const breadcrumbLd = buildBreadcrumbListSchema({
    items: [
      { name: "Home", url: siteUrl },
      { name: article.category.name, url: `${siteUrl}${categoryHref(article.category.slug)}` },
      { name: article.title },
    ],
  });

  // ScrollShareNudge takes the canonical slug (Content.slug) not the
  // full URL, so cache it once here.
  const slug = article.slug || "";

  return (
    <div className="min-h-screen bg-gray-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(newsArticleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbLd) }} />
      <ScrollShareNudge title={article.title} slug={slug} articleUrl={canonical} />
      <SiteHeader />

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 12px" }}>
        <nav style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#888", marginBottom: 16 }}>
          <Link href="/" style={{ color: "#888", textDecoration: "none" }}>Home</Link>
          <span>/</span>
          <Link href={categoryHref(article.category.slug)} style={{ color: "#888", textDecoration: "none" }}>{article.category.name}</Link>
          <span>/</span>
          <span style={{ color: "#555" }}>{article.title.substring(0, 40)}...</span>
        </nav>

        <div className="article-layout" style={{ display: "flex", gap: 24 }}>
          <article style={{ flex: 1, minWidth: 0 }}>
            <Badge color={article.category.color || "#FF2C2C"}>{article.category.name}</Badge>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#000", lineHeight: 1.4, marginTop: 10 }}>
              {article.title}
            </h1>

            {/* Byline strip - desk name + (published / updated) timestamps. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
              <div>
                <div style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 15, fontWeight: 800, color: "#1a1a1a" }}>
                  {article.desk?.name ?? article.author.name}
                </div>
                <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {(() => {
                    const pub = article.publishedAt ? new Date(article.publishedAt) : null;
                    const upd = article.updatedAt ? new Date(article.updatedAt) : null;
                    const edited = pub && upd && upd.getTime() - pub.getTime() > 5 * 60_000;
                    if (edited && upd) return `Updated · ${formatRelativeTelugu(upd)}`;
                    if (pub) return `Published · ${formatRelativeTelugu(pub)}`;
                    return "";
                  })()}
                </p>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#888" }}>
                {article.viewCount.toLocaleString()} views
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
              <TTSButton text={article.body || ""} />
            </div>
            <ShareBar
              title={article.title}
              articleUrl={canonical}
              body={article.body || ""}
              featuredImage={article.featuredImage}
              deskName={article.desk?.name ?? null}
            />

            {/* Featured media hero: a video (YouTube embed or hosted MP4)
                REPLACES the image when set - the editor enforces image-OR-video,
                never both. Falls back to the image, then to nothing. */}
            {article.featuredVideo ? (
              <div style={{ marginTop: 20 }}>
                {ytEmbed(article.featuredVideo) ? (
                  // 16:9 responsive iframe wrapper.
                  <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 8, overflow: "hidden", background: "#000" }}>
                    <iframe
                      src={ytEmbed(article.featuredVideo)!}
                      title={article.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      loading="lazy"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
                    />
                  </div>
                ) : (
                  // Hosted MP4 / Azure Blob - native player. No caption track:
                  // user-supplied news clips don't ship VTT files.
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    src={article.featuredVideo}
                    controls
                    playsInline
                    preload="metadata"
                    style={{ width: "100%", borderRadius: 8, maxHeight: 500, background: "#000" }}
                  />
                )}
                {article.imageCaption && <p style={{ fontSize: 12, color: "#888", marginTop: 6, fontStyle: "italic" }}>{article.imageCaption}</p>}
              </div>
            ) : article.featuredImage ? (
              <div style={{ marginTop: 20 }}>
                {/* Hero image renders at its natural aspect ratio. No fixed
                    height container + no dark backdrop, so portrait phone
                    shots and wide DSLR frames both fill the column edge-to-
                    edge without left/right letterbox bars.
                    width:100% + height:auto + maxHeight:600 makes very tall
                    portraits cap height (and shrink width proportionally to
                    keep aspect) so a 9:16 doesn't dominate the article.
                    next/image still negotiates AVIF/WebP + responsive
                    variants via `sizes`. */}
                <Image
                  src={article.featuredImage}
                  alt={article.title}
                  width={1200}
                  height={675}
                  sizes="(max-width: 768px) 100vw, 800px"
                  priority
                  style={{
                    width: "100%",
                    height: "auto",
                    maxHeight: 600,
                    objectFit: "contain",
                    display: "block",
                    borderRadius: 8,
                  }}
                />
                {article.imageCaption && <p style={{ fontSize: 12, color: "#888", marginTop: 6, fontStyle: "italic" }}>{article.imageCaption}</p>}
              </div>
            ) : null}

            <div
              className="article-body"
              style={{ marginTop: 24 }}
              dangerouslySetInnerHTML={{
                __html: injectInlineByline(sanitizeArticleHtml(article.body || ""), article.desk?.name, article.title),
              }}
            />

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

            {related.length > 0 && (
              <div style={{ marginTop: 32 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: "#000", marginBottom: 16, paddingBottom: 8, borderBottom: "2px solid var(--color-brand)" }}>
                  Related Articles
                </h3>
                <div className="related-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {related.filter((r) => r.id !== article.id).slice(0, 4).map((r) => (
                    <Link key={r.id} href={articleHref(r)} style={{ display: "flex", gap: 10, textDecoration: "none" }}>
                      {r.featuredImage && (
                        <Image
                          src={r.featuredImage}
                          alt=""
                          width={100}
                          height={70}
                          style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                        />
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

            <CommentsSection articleId={article.id} />
          </article>
          <DialectGlosser />

          <aside className="article-sidebar" style={{ width: 320, flexShrink: 0 }}>
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", padding: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--color-brand)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--color-brand)" }}>
                Trending
              </h3>
              {trending.map((t, i) => (
                <Link key={t.id} href={articleHref(t)} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid #f5f5f5", textDecoration: "none" }}>
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

      <SiteFooter />
    </div>
  );
}
