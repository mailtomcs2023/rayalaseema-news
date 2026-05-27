// Spec #4 K5 (#250) — LiveBlogPosting JSON-LD.
//
// Earns the red "LIVE" badge in Google Top Stories. Articles flagged
// `Content.liveBlog != null` emit this in place of NewsArticle. Each
// reporter-added entry is a BlogPosting inside `liveBlogUpdate`.
//
// Cron bumps Content.updatedAt + ContentLiveBlog.entries on a 5-min
// cadence while the live blog is active; once endedAt is set we stop
// pinging IndexNow.

import type { JsonLd, AuthorRef, PublisherConfig } from "./types";

interface LiveEntry {
  /** ISO 8601 timestamp of the update. */
  at: string;
  /** Optional sub-headline for this specific update. */
  headline?: string;
  /** HTML or text content. */
  html: string;
  /** Optional image to feature on this entry. */
  image?: string;
}

interface BuildArgs {
  title: string;
  summary?: string | null;
  startedAt: string;
  endedAt?: string | null;
  coverImage?: string | null;
  entries: LiveEntry[];
  author: AuthorRef;
  publisher: PublisherConfig;
  canonicalUrl: string;
}

export function buildLiveBlogPostingSchema(args: BuildArgs): JsonLd {
  const { title, summary, startedAt, endedAt, coverImage, entries, author, publisher, canonicalUrl } = args;
  return {
    "@context": "https://schema.org",
    "@type": "LiveBlogPosting",
    headline: title,
    description: summary || undefined,
    image: coverImage || undefined,
    datePublished: startedAt,
    dateModified: entries.length > 0 ? entries[entries.length - 1].at : startedAt,
    coverageStartTime: startedAt,
    coverageEndTime: endedAt || undefined,
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
    liveBlogUpdate: entries.map((e, idx) => ({
      "@type": "BlogPosting",
      headline: e.headline ?? `Update ${idx + 1}`,
      articleBody: e.html,
      image: e.image,
      datePublished: e.at,
      dateModified: e.at,
    })),
  };
}
