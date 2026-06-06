// Canonical article route (Eenadu-style). Everything lives under /telugu-news/:
//
//   /telugu-news/<district>/<constituency>/<slug>   (geo-tagged local story)
//   /telugu-news/<category>/<slug>                  (category story)
//
// A catch-all because those two shapes have different depths (3 vs 2 segments).
// We resolve the article by its LAST segment (the slug, which is DB-unique),
// then 301 to its canonical articleHref() if the path's category/district
// doesn't match - so wrong/stale/thin internal links self-heal to the real URL.

import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ArticleView } from "@/components/article-view";
import { buildArticleMetadata } from "@/lib/article-metadata";
import { getArticleBySlug, getTrendingArticles, getArticlesByCategory, incrementViewCount } from "@/lib/db-queries";
import { articleHref } from "@/lib/article-href";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemanews.com";

type Params = Promise<{ parts: string[] }>;

async function resolve(parts: string[]) {
  // The slug is always the last path segment; the leading segments are the
  // category or district/constituency, used only for the canonical check.
  const slug = parts?.[parts.length - 1];
  if (!slug) return null;
  const article = await getArticleBySlug(slug);
  if (!article || !article.slug) return null;
  const canonical = articleHref(article); // e.g. /telugu-news/andhra-pradesh/<slug>
  const requested = `/telugu-news/${parts.join("/")}`;
  return { article, canonical, requested };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { parts } = await params;
  const r = await resolve(parts);
  if (!r) return { title: "Not found" };
  return buildArticleMetadata(r.article as never, SITE_URL);
}

export default async function TeluguNewsArticlePage({ params }: { params: Params }) {
  const { parts } = await params;
  const r = await resolve(parts);
  if (!r) return notFound();
  // Path doesn't match the article's canonical URL → 301 to canonical (keeps
  // Google from indexing duplicate category/district variants).
  if (r.requested !== r.canonical) permanentRedirect(r.canonical);

  const article = r.article;
  if (!article.category) return notFound();

  incrementViewCount(article.id).catch(() => {});

  const [trending, related] = await Promise.all([
    getTrendingArticles(8),
    getArticlesByCategory(article.category.slug, 4),
  ]);

  return (
    <ArticleView
      article={article as never}
      related={related as never}
      trending={trending as never}
      siteUrl={SITE_URL}
    />
  );
}
