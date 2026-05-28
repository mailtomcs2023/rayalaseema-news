// NewsArticle JSON-LD generator. Spec #4 B1 (#197).
//
// Emits the canonical NewsArticle payload for every article page. Includes:
//
//   - Person author with `url` → /author/<publicProfileSlug> + sameAs links
//   - NewsMediaOrganization publisher (full org schema is B2 #198)
//   - dateModified + datePublished (ISO 8601)
//   - contentLocation + spatialCoverage from the article's primary location
//     chain (mandal > constituency > district picks the most specific)
//   - inLanguage: te
//   - articleSection from category
//   - SpeakableSpecification on H1 + lede for voice-search eligibility
//   - image: single URL today; the multi-aspect trio (16:9 / 4:3 / 1:1) wires
//     in once Phase E1 (#220) ships the sharp upload pipeline (generator
//     already accepts an array so swapping in the trio is one line later)
//
// LiveBlogPosting sibling variant is deferred to K5 (#250) — needs the
// Content.isLive flag + cron dateModified bump.

import type { JsonLd, LocationChain, AuthorRef, PublisherConfig, LocationRef } from "./types";

type ArticleInput = {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  body?: string | null;
  featuredImage?: string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  articleSection?: string | null;
  /** Keyword list for AI-search engines (Perplexity, ChatGPT, Gemini all
   *  parse this). Derived from article tags + category by the caller. */
  keywords?: string[];
};

interface BuildArgs {
  article: ArticleInput;
  author: AuthorRef;
  publisher: PublisherConfig;
  locationChain?: LocationChain | null;
  /** Canonical absolute URL of the article, e.g. https://.../[d]/[c]/<slug>-<id>. */
  canonicalUrl: string;
  /** Image URLs in render-quality order. Multi-aspect array ships post-E1. */
  images?: string | string[] | null;
}

function toIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  return typeof d === "string" ? d : d.toISOString();
}

/** Most-specific location wins. Mandal > Constituency > District. */
function pickContentLocation(chain: LocationChain | null | undefined): LocationRef | null {
  if (!chain) return null;
  return chain.mandal ?? chain.constituency ?? chain.district ?? null;
}

function buildPlace(loc: LocationRef): Record<string, unknown> {
  const out: Record<string, unknown> = {
    "@type": "Place",
    name: loc.nameEn || loc.name,
  };
  if (typeof loc.lat === "number" && typeof loc.lng === "number") {
    out.geo = {
      "@type": "GeoCoordinates",
      latitude: loc.lat,
      longitude: loc.lng,
    };
  }
  return out;
}

function buildAuthor(author: AuthorRef, siteUrl: string, publisher: PublisherConfig): Record<string, unknown> {
  const sameAs = [
    author.twitterHandle ? `https://twitter.com/${author.twitterHandle.replace(/^@/, "")}` : null,
    author.linkedinUrl ?? null,
    author.facebookUrl ?? null,
  ].filter((u): u is string => Boolean(u));
  return {
    "@type": "Person",
    name: author.name,
    url: `${siteUrl}/author/${author.publicProfileSlug}`,
    image: author.avatar ?? undefined,
    description: author.bio ?? undefined,
    jobTitle: author.role ?? undefined,
    knowsAbout: author.expertise && author.expertise.length > 0 ? author.expertise : undefined,
    alumniOf: author.affiliations && author.affiliations.length > 0 ? author.affiliations : undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    worksFor: {
      "@type": "NewsMediaOrganization",
      name: publisher.publicationName,
      url: publisher.siteUrl,
    },
  };
}

function buildPublisher(pub: PublisherConfig): Record<string, unknown> {
  return {
    "@type": "NewsMediaOrganization",
    name: pub.publicationName,
    alternateName: pub.publicationNameTe,
    url: pub.siteUrl,
    logo: {
      "@type": "ImageObject",
      url: pub.logoUrl,
    },
  };
}

function normalizeImages(images?: string | string[] | null, fallback?: string | null): string[] | undefined {
  const arr: string[] = [];
  if (Array.isArray(images)) arr.push(...images.filter(Boolean));
  else if (typeof images === "string" && images) arr.push(images);
  else if (fallback) arr.push(fallback);
  return arr.length > 0 ? arr : undefined;
}

/**
 * Returns the NewsArticle JSON-LD payload. Consumers serialize via
 * `stringifyJsonLd(...)` and inject into `<script type="application/ld+json">`.
 *
 * Speakable selectors target the H1 and the first <p> inside .article-body
 * — pages must keep those stable for voice-assistant pickup.
 */
export function buildNewsArticleSchema(args: BuildArgs): JsonLd {
  const { article, author, publisher, locationChain, canonicalUrl } = args;
  const imageArr = normalizeImages(args.images, article.featuredImage);
  const contentLoc = pickContentLocation(locationChain);

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.summary || undefined,
    image: imageArr,
    datePublished: toIso(article.publishedAt),
    dateModified: toIso(article.updatedAt ?? article.publishedAt),
    author: buildAuthor(author, publisher.siteUrl, publisher),
    publisher: buildPublisher(publisher),
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    articleSection: article.articleSection ?? undefined,
    keywords: article.keywords && article.keywords.length > 0 ? article.keywords.join(", ") : undefined,
    inLanguage: "te",
    contentLocation: contentLoc ? buildPlace(contentLoc) : undefined,
    spatialCoverage: contentLoc ? buildPlace(contentLoc) : undefined,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", ".article-body p:first-of-type"],
    },
  };
}
