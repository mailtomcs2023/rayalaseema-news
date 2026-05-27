// New canonical article route: /[district]/[constituency]/<slug>-<id8>
// Phase A0 URL migration.
//
// Validates the entire URL chain — district slug, constituency slug, slug, and
// id-suffix must all line up with what's in the DB — and 404s otherwise. The
// id-suffix check is the collision guard: if someone hand-crafts a URL with a
// slug that exists but a wrong suffix (pointing at a different article), we
// refuse to render.

import { notFound, redirect, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { ArticleView } from "@/components/article-view";
import { buildArticleMetadata } from "@/lib/article-metadata";
import { getArticleBySlug, getTrendingArticles, getArticlesByCategory, incrementViewCount } from "@/lib/db-queries";
import { articleHref, parseSlugId, suffixMatchesId } from "@/lib/article-href";

const SITE_URL = process.env.SITE_URL || "https://rayalaseemaexpress.com";

type Params = Promise<{ district: string; constituency: string; slugid: string }>;

async function resolveArticle(params: { district: string; constituency: string; slugid: string }) {
  const parsed = parseSlugId(params.slugid);
  if (!parsed) return null;
  const article = await getArticleBySlug(parsed.slug);
  if (!article || !article.slug) return null;
  if (!suffixMatchesId(parsed.suffix, article.id)) return null;
  // The URL must match what articleHref() would produce. If not, redirect to
  // canonical (prevents duplicate-content indexing of variant geo paths).
  const canonicalPath = articleHref(article);
  const requestedPath = `/${params.district}/${params.constituency}/${params.slugid}`;
  if (canonicalPath !== requestedPath) {
    return { article: null, redirectTo: canonicalPath };
  }
  return { article, redirectTo: null };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await params;
  const r = await resolveArticle(p);
  if (!r || !r.article) return { title: "Not found" };
  return buildArticleMetadata(r.article as never, SITE_URL);
}

export default async function ArticlePage({ params }: { params: Params }) {
  const p = await params;
  const r = await resolveArticle(p);
  if (!r) return notFound();
  if (r.redirectTo) {
    // Wrong district/constituency in URL — 301 to the article's true canonical.
    permanentRedirect(r.redirectTo);
  }
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
