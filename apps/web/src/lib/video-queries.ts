// Shared reads for the video section. Videos live in the unified Content table
// (type=VIDEO for bulletins/long form, type=REEL for shorts) - the standalone
// Video model was dropped in Spec #1 A1C #189.

import { prisma, Prisma } from "@rayalaseema/db";

export const VIDEO_TYPES = ["VIDEO", "REEL"] as const;

export type VideoCardItem = {
  id: string;
  title: string;
  slug: string;
  href: string;
  thumbnail: string;
  videoId: string | null;
  publishedAt: string | null;
  isShort: boolean;
  summary: string | null;
};

const CARD_SELECT = {
  id: true,
  type: true,
  title: true,
  slug: true,
  summary: true,
  featuredImage: true,
  payload: true,
  publishedAt: true,
} as const;

type CardRow = {
  id: string;
  type: string;
  title: string;
  slug: string | null;
  summary: string | null;
  featuredImage: string | null;
  payload: unknown;
  publishedAt: Date | null;
};

/** Every video page lives under /videos/<slug>, whatever its Content type. */
export function videoHref(slug: string | null): string {
  return slug ? `/videos/${slug}` : "#";
}

export function toVideoCard(row: CardRow): VideoCardItem {
  const p = (row.payload as Record<string, unknown> | null) || {};
  const videoId = typeof p.videoId === "string" ? p.videoId : null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug || "",
    href: videoHref(row.slug),
    thumbnail:
      (typeof p.thumbnailUrl === "string" ? p.thumbnailUrl : null) ||
      row.featuredImage ||
      (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ""),
    videoId,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    isShort: row.type === "REEL",
    summary: row.summary,
  };
}

/**
 * Newest published videos.
 * `kind`: "all" for the main grid, "video" for bulletins, "short" for shorts.
 */
export async function getVideos({
  kind = "all",
  take = 24,
  skip = 0,
  excludeSlug,
}: {
  kind?: "all" | "video" | "short";
  take?: number;
  skip?: number;
  excludeSlug?: string;
} = {}): Promise<VideoCardItem[]> {
  const typeFilter: Prisma.ContentWhereInput["type"] =
    kind === "video" ? "VIDEO" : kind === "short" ? "REEL" : { in: ["VIDEO", "REEL"] };

  const rows = await prisma.content.findMany({
    where: {
      type: typeFilter,
      status: "PUBLISHED",
      ...(excludeSlug ? { slug: { not: excludeSlug } } : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take,
    skip,
    select: CARD_SELECT,
  });
  return rows.map(toVideoCard);
}

export async function countVideos(kind: "all" | "video" | "short" = "all"): Promise<number> {
  const typeFilter: Prisma.ContentWhereInput["type"] =
    kind === "video" ? "VIDEO" : kind === "short" ? "REEL" : { in: ["VIDEO", "REEL"] };
  return prisma.content.count({ where: { type: typeFilter, status: "PUBLISHED" } });
}

/** Full row for /videos/<slug>. Returns null for anything unpublished. */
export async function getVideoBySlug(slug: string) {
  const row = await prisma.content.findUnique({
    where: { slug },
    include: {
      category: { select: { name: true, slug: true } },
      constituency: { select: { name: true, slug: true, district: { select: { name: true, slug: true } } } },
    },
  });
  if (!row || (row.type !== "VIDEO" && row.type !== "REEL") || row.status !== "PUBLISHED") return null;

  const p = (row.payload as Record<string, unknown> | null) || {};
  const videoId = typeof p.videoId === "string" ? p.videoId : null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug || "",
    // Story text written by the desk, already stripped of the YouTube links
    // block at import time. This is what keeps the page from being thin.
    body: row.body || "",
    summary: row.summary,
    thumbnail:
      (typeof p.thumbnailUrl === "string" ? p.thumbnailUrl : null) ||
      row.featuredImage ||
      (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ""),
    videoId,
    durationSeconds: typeof p.duration === "number" ? p.duration : null,
    // Telugu transcript written by Video IQ (spec 12.5); null for older videos.
    transcript: typeof p.transcript === "string" && p.transcript.trim() ? p.transcript.trim() : null,
    isShort: row.type === "REEL",
    publishedAt: row.publishedAt,
    viewCount: row.viewCount,
    categoryId: row.categoryId,
    category: row.category,
    constituencyId: row.constituencyId,
    constituency: row.constituency,
  };
}

/**
 * Text articles to link out to from a video page - same constituency first,
 * then same category. Internal links out of a video page are the whole point
 * of the cross-linking work: without them these pages are dead ends.
 */
export async function getRelatedArticlesForVideo({
  categoryId,
  constituencyId,
  take = 5,
}: {
  categoryId?: string | null;
  constituencyId?: string | null;
  take?: number;
}) {
  const select = {
    id: true,
    title: true,
    slug: true,
    featuredImage: true,
    publishedAt: true,
    category: { select: { slug: true } },
    constituency: { select: { slug: true, district: { select: { slug: true } } } },
  } as const;

  type RelatedRow = {
    id: string;
    title: string;
    slug: string | null;
    featuredImage: string | null;
    publishedAt: Date | null;
    category: { slug: string } | null;
    constituency: { slug: string; district: { slug: string } } | null;
  };
  const seen = new Set<string>();
  const out: RelatedRow[] = [];

  for (const where of [
    constituencyId ? { constituencyId } : null,
    categoryId ? { categoryId } : null,
    {},
  ]) {
    if (!where || out.length >= take) continue;
    const rows = await prisma.content.findMany({
      where: { type: "ARTICLE", status: "PUBLISHED", ...where, id: { notIn: [...seen] } },
      orderBy: { publishedAt: "desc" },
      take: take - out.length,
      select,
    });
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}
