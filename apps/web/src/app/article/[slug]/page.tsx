// Legacy article route. Phase A0 URL migration:
//
// - Under URL_PATTERN=new (default), middleware (apps/web/middleware.ts) 301s
//   every /article/<slug> request to the canonical /[district]/[constituency]/<slug>-<id>
//   URL. This page is only reached when URL_PATTERN=legacy is set as the
//   rollback escape hatch.
// - The legacy page still renders the article correctly (using the same
//   ArticleView + buildArticleMetadata helpers as the new routes), so a
//   30-day rollback window is risk-free.
// - AMP variant deleted in this same migration (see spec Phase A0 decision #9).

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArticleView } from "@/components/article-view";
import { buildArticleMetadata } from "@/lib/article-metadata";
import { getArticleBySlug, getTrendingArticles, getArticlesByCategory, incrementViewCount } from "@/lib/db-queries";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: "Not found" };
  return buildArticleMetadata(article as never, SITE_URL);
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return notFound();
  // category nullable in schema for uncategorised drafts; public route 404s
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
