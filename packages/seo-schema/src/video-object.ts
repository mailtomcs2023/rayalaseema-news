/**
 * VideoObject JSON-LD for /videos/<slug> pages.
 *
 * Google needs this to show a video thumbnail in Search and to surface the page
 * in the Videos tab; without it a video page competes as plain text against the
 * article that covers the same story.
 */

import type { JsonLd } from "./types";

export interface VideoObjectInput {
  title: string;
  /** Story text, already stripped of the YouTube links/hashtag block. */
  description: string;
  videoId: string;
  publishedAt: Date | string;
  /** Canonical page URL (not the YouTube URL). */
  pageUrl: string;
  /** Desk-set still; YouTube's own is used as a fallback. */
  thumbnailUrl?: string | null;
  /** Seconds. Omitted when unknown - a wrong duration is worse than none. */
  durationSeconds?: number | null;
  /** Spoken Telugu (Video IQ, spec 12.5). Emitted whitespace-collapsed, 5,000 chars max. */
  transcript?: string | null;
  publisher: {
    name: string;
    logoUrl: string;
    siteUrl: string;
  };
}

/** Seconds -> ISO 8601 duration ("PT4M13S"), which is what schema.org expects. */
function isoDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

export function buildVideoObjectSchema(input: VideoObjectInput): JsonLd {
  const uploadDate =
    typeof input.publishedAt === "string" ? input.publishedAt : input.publishedAt.toISOString();

  const description = input.description.replace(/\s+/g, " ").trim().slice(0, 200);

  const thumbnails = [
    input.thumbnailUrl,
    // maxres only exists for HD uploads; hqdefault always does, so list both
    // and let Google pick the one that resolves.
    `https://i.ytimg.com/vi/${input.videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${input.videoId}/hqdefault.jpg`,
  ].filter((u): u is string => Boolean(u));

  const schema: JsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: input.title,
    description,
    thumbnailUrl: Array.from(new Set(thumbnails)),
    uploadDate,
    embedUrl: `https://www.youtube.com/embed/${input.videoId}`,
    contentUrl: `https://www.youtube.com/watch?v=${input.videoId}`,
    url: input.pageUrl,
    ...(input.transcript?.trim()
      ? { transcript: Array.from(input.transcript.replace(/\s+/g, " ").trim()).slice(0, 5000).join("") }
      : {}),
    publisher: {
      "@type": "NewsMediaOrganization",
      name: input.publisher.name,
      url: input.publisher.siteUrl,
      logo: { "@type": "ImageObject", url: input.publisher.logoUrl },
    },
  };

  if (input.durationSeconds && input.durationSeconds > 0) {
    schema.duration = isoDuration(input.durationSeconds);
  }

  return schema;
}
