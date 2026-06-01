// Shared generateMetadata helper for all three article routes (legacy
// /article/[slug], new /[district]/[constituency]/[slugid], and the
// /news/[slugid] fallback). Phase A0 URL migration.

import type { Metadata } from "next";
import { articleHref } from "./article-href";

type ArticleMeta = {
  id: string;
  slug: string | null;
  status: string;
  title: string;
  summary: string | null;
  featuredImage: string | null;
  publishedAt: Date | null;
  updatedAt: Date | null;
  author: { name: string };
  desk?: { name: string } | null;
  constituency?: { slug: string; district: { slug: string } } | null;
  // editor-set SEO overrides - may not exist on every projected row, so we use
  // a permissive index access.
} & { [k: string]: unknown };

export function buildArticleMetadata(article: ArticleMeta, siteUrl: string): Metadata {
  const metaTitle = (article.metaTitle as string) || article.title;
  const metaDescription =
    (article.metaDescription as string) || article.summary || article.title;
  // Featured image OR auto-generated branded card from /api/og/<slug>.
  const ogImage =
    (article.ogImage as string) ||
    article.featuredImage ||
    `${siteUrl}/api/og/${article.slug}`;
  const canonical = `${siteUrl}${articleHref(article)}`;
  const noindex = article.status !== "PUBLISHED";
  return {
    title: `${metaTitle} | రాయలసీమ న్యూస్`,
    description: metaDescription,
    alternates: { canonical },
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
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
