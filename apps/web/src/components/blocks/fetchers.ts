// Page Builder (Spec #2) - per-block data fetchers.
//
// Each fetcher takes (config, pageContext) and returns the data props the
// matching React component expects. Fetchers query the unified Content table
// directly (Spec #1 #110 - Article/Video/etc. are dormant; reads go through
// Content). This file is intentionally separate from apps/web/src/lib/db-queries.ts
// so the page-builder layer can evolve independently from the legacy callers.

import { prisma } from "@rayalaseema/db";
import type { PageContext } from "./types";
import type {
  aboveFoldConfig,
  adBannerMidConfig,
  adHeaderLeaderboardConfig,
  adInFeedBannerConfig,
  adLeaderboardConfig,
  categoryPairConfig,
  cinemaBandConfig,
  photoGalleryConfig,
  sectionBandConfig,
  videoSectionConfig,
  webStoriesConfig,
} from "@rayalaseema/db";
import type { z } from "zod";

// --- Helpers ---

function teluguTimeAgoIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function toAFArticle(c: {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  featuredImage: string | null;
  publishedAt: Date | null;
  category: { name: string; color: string | null; slug: string } | null;
}) {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug || "",
    summary: c.summary,
    featuredImage: c.featuredImage,
    publishedAt: teluguTimeAgoIso(c.publishedAt),
    category: c.category
      ? { name: c.category.name, color: c.category.color || "#E01B1B", slug: c.category.slug }
      : { name: "", color: "#E01B1B", slug: "" },
  };
}

function toBandArticle(c: {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  featuredImage: string | null;
  category: { name: string } | null;
}) {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug || "",
    summary: c.summary,
    featuredImage: c.featuredImage,
    label: c.category?.name || null,
  };
}

// --- Ads ---

export async function fetchAds(position: string) {
  const ads = await prisma.ad.findMany({
    where: { active: true, position: position as never },
    orderBy: { createdAt: "desc" },
  });
  return ads.map((a) => ({
    id: a.id,
    position: a.position,
    htmlContent: a.htmlContent,
    imageUrl: a.imageUrl,
    linkUrl: a.linkUrl,
    name: a.name,
  }));
}

export async function fetchAdHeaderLeaderboard(
  config: z.infer<typeof adHeaderLeaderboardConfig>,
) {
  return { ads: await fetchAds(config.position) };
}

export async function fetchAdBannerMid(config: z.infer<typeof adBannerMidConfig>) {
  return { ads: await fetchAds(config.position) };
}

export async function fetchAdLeaderboard(config: z.infer<typeof adLeaderboardConfig>) {
  return { ads: await fetchAds(config.position) };
}

export async function fetchAdInFeedBanner(config: z.infer<typeof adInFeedBannerConfig>) {
  return { ads: await fetchAds(config.position) };
}

// --- AboveFold ---

export async function fetchAboveFold(
  config: z.infer<typeof aboveFoldConfig>,
  _ctx: PageContext,
) {
  const exclude = new Set(config.excludeCategories);

  const pool = await prisma.content.findMany({
    where: { type: "ARTICLE", status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 80,
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      featuredImage: true,
      publishedAt: true,
      featured: true,
      category: { select: { name: true, slug: true, color: true } },
    },
  });

  const filtered = pool.filter((c) => c.category && !exclude.has(c.category.slug));
  const leadSrc = filtered.find((c) => c.featured) || filtered[0] || null;
  if (!leadSrc) return null;

  const lead = toAFArticle(leadSrc);
  const latest = filtered
    .filter((c) => c.id !== leadSrc.id)
    .slice(0, config.latestCount)
    .map(toAFArticle);

  const districts = await prisma.district.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    take: config.districtCount,
    select: { name: true, slug: true },
  });

  const districtArticles = await Promise.all(
    districts.map(async (d) => {
      const arts = await prisma.content.findMany({
        where: {
          type: "ARTICLE",
          status: "PUBLISHED",
          constituency: { district: { slug: d.slug } },
        },
        orderBy: { publishedAt: "desc" },
        take: 4,
        select: { id: true, title: true, slug: true },
      });
      return {
        name: d.name,
        slug: d.slug,
        articles: arts.map((a) => ({ id: a.id, title: a.title, slug: a.slug || "" })),
      };
    }),
  );

  const breakingRows = await prisma.content.findMany({
    where: { type: "BREAKING_NEWS", status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: 6,
    select: { id: true, title: true },
  });

  return {
    lead,
    districts: districtArticles
      .filter((d) => d.articles.length > 0)
      .sort((a, b) => b.articles.length - a.articles.length),
    breaking: breakingRows.map((b) => ({ id: b.id, text: b.title })),
    latest,
  };
}

// --- SectionBand ---

export async function fetchSectionBand(
  config: z.infer<typeof sectionBandConfig>,
  ctx: PageContext,
) {
  // Pass-through mode: when the config omits brand / brandHref / categorySlug
  // the block reads them from the page context (Standard Category template).
  const slug = config.categorySlug || ctx.categorySlug;
  if (!slug) return null;

  const [arts, cat] = await Promise.all([
    prisma.content.findMany({
      where: {
        type: "ARTICLE",
        status: "PUBLISHED",
        // Match if either the PRIMARY category OR any of the cross-listed
        // additionalCategories rows points at this slug. Lets a
        // movie-review primary-categorized story also surface in
        // /category/entertainment when the editor opted in.
        OR: [
          { category: { slug } },
          { additionalCategories: { some: { category: { slug } } } },
        ],
      },
      orderBy: { publishedAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        featuredImage: true,
        publishedAt: true,
        viewCount: true,
        category: { select: { name: true } },
      },
    }),
    config.brand ? Promise.resolve(null) : prisma.category.findUnique({ where: { slug }, select: { name: true } }),
  ]);

  const brand = config.brand || cat?.name || slug;
  const brandHref = config.brandHref || `/category/${slug}`;

  const lead = arts[0] ? toBandArticle(arts[0]) : null;
  if (!lead) return null;

  const grid = arts.slice(1, 1 + config.gridCount).map(toBandArticle);
  const trending = [...arts]
    .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
    .slice(0, config.trendingCount)
    .map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug || "",
      publishedAt: a.publishedAt?.toISOString() || null,
    }));

  let cartoon: { title: string; caption: string; image: string; date: string } | null = null;
  if (config.showCartoon) {
    const c = await prisma.content.findFirst({
      where: { type: "CARTOON", status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { title: true, featuredImage: true, payload: true, publishedAt: true },
    });
    if (c && c.featuredImage) {
      const p = (c.payload as Record<string, unknown> | null) || {};
      cartoon = {
        title: c.title,
        caption: (p.caption as string) || c.title,
        image: c.featuredImage,
        date:
          c.publishedAt?.toLocaleDateString("te-IN", { month: "long", day: "numeric" }) || "",
      };
    }
  }

  return {
    brand,
    brandHref,
    tabs: config.tabs,
    lead,
    grid,
    trending,
    cartoon,
  };
}

// --- CinemaBand ---

export async function fetchCinemaBand(
  config: z.infer<typeof cinemaBandConfig>,
  _ctx: PageContext,
) {
  const pool = await prisma.content.findMany({
    where: {
      type: "ARTICLE",
      status: "PUBLISHED",
      category: {
        slug: config.includeMovieReviews
          ? { in: ["entertainment", "movie-reviews"] }
          : "entertainment",
      },
    },
    orderBy: { publishedAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      featuredImage: true,
      payload: true,
      category: { select: { name: true, slug: true } },
    },
  });
  if (!pool[0]) return null;

  const reviewsSrc = pool.filter((c) => c.category?.slug === "movie-reviews");

  return {
    lead: toBandArticle(pool[0]),
    grid: pool.slice(1, 1 + config.gridCount).map(toBandArticle),
    reviews: reviewsSrc.slice(0, config.reviewsCount).map((c) => {
      const p = (c.payload as Record<string, unknown> | null) || {};
      return {
        id: c.id,
        title: c.title,
        slug: c.slug || "",
        reviewerName: typeof p.reviewerName === "string" ? p.reviewerName : null,
        rating: typeof p.rating === "number" ? p.rating : null,
      };
    }),
  };
}

// --- VideoSection ---

export async function fetchVideoSection(
  config: z.infer<typeof videoSectionConfig>,
  _ctx: PageContext,
) {
  const rows = await prisma.content.findMany({
    where: {
      type: "VIDEO",
      status: "PUBLISHED",
      ...(config.featuredOnly ? { featured: true } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: config.count,
    select: {
      id: true,
      title: true,
      slug: true,
      featuredImage: true,
      payload: true,
      viewCount: true,
      category: { select: { name: true } },
    },
  });
  return {
    videos: rows.map((r) => {
      const p = (r.payload as Record<string, unknown> | null) || {};
      const seconds = typeof p.duration === "number" ? p.duration : 0;
      const mm = Math.floor(seconds / 60);
      const ss = String(seconds % 60).padStart(2, "0");
      return {
        id: r.id,
        title: r.title,
        slug: r.slug || "",
        thumbnail: (p.thumbnailUrl as string) || r.featuredImage || "",
        videoUrl: (p.videoUrl as string) || null,
        duration: seconds > 0 ? `${mm}:${ss}` : null,
        views: r.viewCount,
        category: r.category?.name || null,
      };
    }),
  };
}

// --- CategoryPair ---

export async function fetchCategoryPair(
  config: z.infer<typeof categoryPairConfig>,
  _ctx: PageContext,
) {
  const columns = await Promise.all(
    config.columns.map(async (col) => {
      const arts = await prisma.content.findMany({
        where: {
          type: "ARTICLE",
          status: "PUBLISHED",
          // Primary OR cross-listed (see comment in fetchSectionBand).
          OR: [
            { category: { slug: col.slug } },
            { additionalCategories: { some: { category: { slug: col.slug } } } },
          ],
        },
        orderBy: { publishedAt: "desc" },
        take: col.leadCount + col.itemsCount,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          featuredImage: true,
        },
      });
      const toCol = (a: typeof arts[number]) => ({
        id: a.id,
        title: a.title,
        slug: a.slug || "",
        summary: a.summary,
        featuredImage: a.featuredImage,
      });
      if (!arts[0]) return null;
      return {
        title: col.title,
        slug: col.slug,
        lead: toCol(arts[0]),
        items: arts.slice(col.leadCount, col.leadCount + col.itemsCount).map(toCol),
      };
    }),
  );
  return { columns: columns.filter((c): c is NonNullable<typeof c> => c !== null) };
}

// --- WebStories ---

export async function fetchWebStories(
  config: z.infer<typeof webStoriesConfig>,
  _ctx: PageContext,
) {
  const rows = await prisma.content.findMany({
    where: { type: "WEB_STORY", status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: config.count,
    select: {
      id: true,
      title: true,
      featuredImage: true,
      category: { select: { slug: true } },
    },
  });
  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      image: r.featuredImage || "",
      category: r.category?.slug || "",
    })),
  };
}

// --- PhotoGallery ---

export async function fetchPhotoGallery(
  config: z.infer<typeof photoGalleryConfig>,
  _ctx: PageContext,
) {
  const rows = await prisma.content.findMany({
    where: { type: "PHOTO_GALLERY", status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: config.count,
    select: { id: true, title: true, featuredImage: true, payload: true },
  });
  return {
    photos: rows.map((r) => {
      const p = (r.payload as Record<string, unknown> | null) || {};
      const photos = Array.isArray(p.photos) ? (p.photos as unknown[]) : [];
      return {
        id: r.id,
        title: r.title,
        image: r.featuredImage || "",
        count: photos.length,
      };
    }),
  };
}
