// /news/<slug>-<id8> - fallback route for articles that lack a constituency
// tag. Once Phase G2 ships (NER auto-tagging on publish) + editors backfill
// the existing corpus, this route's traffic shrinks to near-zero and the
// fallback can be removed.
//
// Phase A0 URL migration. Same validation pattern as the canonical
// /[district]/[constituency]/[slugid] route.

import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ArticleView } from "@/components/article-view";
import { buildArticleMetadata } from "@/lib/article-metadata";
import { getArticleBySlug, getTrendingArticles, getArticlesByCategory, incrementViewCount } from "@/lib/db-queries";
import { articleHref, parseSlugId, suffixMatchesId } from "@/lib/article-href";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

type Params = Promise<{ slugid: string }>;

async function resolveArticle(slugid: string) {
  const parsed = parseSlugId(slugid);
  if (!parsed) return null;
  const article = await getArticleBySlug(parsed.slug);
  if (!article || !article.slug) return null;
  if (!suffixMatchesId(parsed.suffix, article.id)) return null;
  // If the article DOES have a constituency, send to canonical geo URL -
  // /news/ is the orphan fallback only.
  const canonicalPath = articleHref(article);
  const requestedPath = `/news/${slugid}`;
  if (canonicalPath !== requestedPath) {
    return { article: null, redirectTo: canonicalPath };
  }
  return { article, redirectTo: null };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slugid } = await params;
  const r = await resolveArticle(slugid);
  if (!r || !r.article) return { title: "Not found" };
  return buildArticleMetadata(r.article as never, SITE_URL);
}

export default async function NewsArticlePage({ params }: { params: Params }) {
  const { slugid } = await params;
  const r = await resolveArticle(slugid);
  if (!r) return notFound();
  if (r.redirectTo) permanentRedirect(r.redirectTo);
  const article = r.article!;
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
