// Person JSON-LD generator. Spec #4 B4 (#200).
//
// Top-level Person schema for the /author/<publicProfileSlug> page. The
// NewsArticle generator (B1) embeds a similar Person payload as a sub-field
// of `author`, but this builder produces a free-standing Person with full
// @context — appropriate for a dedicated author profile page.
//
// `publicProfileSlug` and `sameAs` are REQUIRED for Discover / AI-search
// citation. The Feb 2026 Discover core update demoted publishers without
// these identifiers. See spec doc Section 5.

import type { JsonLd, AuthorRef, PublisherConfig } from "./types";

interface BuildArgs {
  author: AuthorRef;
  publisher: PublisherConfig;
}

/**
 * Returns a top-level Person JSON-LD payload for the author profile page.
 * `worksFor` links to the NewsMediaOrganization, building the entity graph
 * Google + AI engines use to verify author identity across articles.
 */
export function buildPersonSchema(args: BuildArgs): JsonLd {
  const { author, publisher } = args;
  const sameAs = [
    author.twitterHandle ? `https://twitter.com/${author.twitterHandle.replace(/^@/, "")}` : null,
    author.linkedinUrl ?? null,
    author.facebookUrl ?? null,
  ].filter((u): u is string => Boolean(u));

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: author.name,
    url: `${publisher.siteUrl}/author/${author.publicProfileSlug}`,
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
