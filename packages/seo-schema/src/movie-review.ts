// Spec #4 K4 (#249) - Movie + Review + AggregateRating JSON-LD.
//
// Telugu cinema review pages need Review schema with itemReviewed=Movie
// to earn star ratings in SERP. +10% CTR documented vs no-rating
// snippet. Built as a sibling generator to buildNewsArticleSchema so
// /cinema/* pages can call it instead.

import type { JsonLd, AuthorRef, PublisherConfig } from "./types";

interface MovieFacts {
  /** Movie name as released - Telugu form. */
  name: string;
  /** English transliteration, used as `alternateName`. */
  nameEn?: string;
  /** Release date, ISO 8601. */
  datePublished?: string;
  /** Director name. */
  director?: string;
  /** Lead actors (max 6). */
  actors?: string[];
  /** Movie poster URL (1200x675+ recommended). */
  image?: string;
}

interface ReviewFacts {
  /** 1.0 - 5.0 numeric rating. */
  ratingValue: number;
  /** Defaults to 5; some publications use 10-point. */
  bestRating?: number;
  /** Defaults to 1. */
  worstRating?: number;
  /** Headline / summary of the review. */
  headline: string;
  /** Full review body - plain text or HTML. */
  body?: string;
  /** Review publication date. */
  datePublished: string;
  /** Last review edit. */
  dateModified?: string;
}

interface BuildArgs {
  movie: MovieFacts;
  review: ReviewFacts;
  author: AuthorRef;
  publisher: PublisherConfig;
  /** Canonical URL of the review article. */
  canonicalUrl: string;
}

export function buildMovieReviewSchema(args: BuildArgs): JsonLd {
  const { movie, review, author, publisher, canonicalUrl } = args;
  return {
    "@context": "https://schema.org",
    "@type": "Review",
    itemReviewed: {
      "@type": "Movie",
      name: movie.name,
      alternateName: movie.nameEn,
      image: movie.image,
      datePublished: movie.datePublished,
      director: movie.director ? { "@type": "Person", name: movie.director } : undefined,
      actor: movie.actors && movie.actors.length > 0
        ? movie.actors.slice(0, 6).map((a) => ({ "@type": "Person", name: a }))
        : undefined,
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.ratingValue,
      bestRating: review.bestRating ?? 5,
      worstRating: review.worstRating ?? 1,
    },
    name: review.headline,
    reviewBody: review.body,
    datePublished: review.datePublished,
    dateModified: review.dateModified ?? review.datePublished,
    author: {
      "@type": "Person",
      name: author.name,
      url: `${publisher.siteUrl}/author/${author.publicProfileSlug}`,
    },
    publisher: {
      "@type": "NewsMediaOrganization",
      name: publisher.publicationName,
      url: publisher.siteUrl,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    inLanguage: "te",
  };
}
