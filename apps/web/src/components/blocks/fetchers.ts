// Page Builder (Spec #2) - per-block data fetchers.
//
// Each fetcher takes (config, pageContext) and returns the data props the
// matching React component expects. Fetchers query the unified Content table
// directly (Spec #1 #110 - Article/Video/etc. are dormant; reads go through
// Content). This file is intentionally separate from apps/web/src/lib/db-queries.ts
// so the page-builder layer can evolve independently from the legacy callers.

import { prisma, AdPosition } from "@rayalaseema/db";
import type { PageContext } from "./types";
import { categoryHref, normalizeCategoryHref } from "@/lib/category-href";
import { articleHref } from "@/lib/article-href";
import type {
  aboveFoldConfig,
  adBannerMidConfig,
  adHeaderLeaderboardConfig,
  adInFeedBannerConfig,
  adLeaderboardConfig,
  categoryPairConfig,
  cinemaBandConfig,
  latestNewsConfig,
  loopConfig,
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
  constituency?: { slug: string; district: { slug: string } } | null;
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
    // articleHref() prefers constituency (geo URL) over category. Carrying it
    // here keeps homepage links canonical (no /telugu-news/<slug> -> 301 hop).
    constituency: c.constituency ?? null,
  };
}

function toBandArticle(c: {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  featuredImage: string | null;
  category: { name: string; slug?: string } | null;
  constituency?: { slug: string; district: { slug: string } } | null;
}) {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug || "",
    summary: c.summary,
    featuredImage: c.featuredImage,
    label: c.category?.name || null,
    // For articleHref() -> canonical /telugu-news/<category>/<slug> (or geo).
    category: c.category?.slug ? { slug: c.category.slug } : null,
    constituency: c.constituency ?? null,
  };
}

// --- Ads ---

// Positions the DB column (Prisma AdPosition enum) actually accepts. The
// page-builder Zod schema allows a value the enum doesn't yet have
// (HEADER_LEADERBOARD), so guard here: an unknown position returns no ads
// rather than throwing a Prisma validation error that 500s the whole page.
// Auto-heals if the value is later added to the enum.
const VALID_AD_POSITIONS = new Set<string>(Object.values(AdPosition));

export async function fetchAds(position: string) {
  if (!VALID_AD_POSITIONS.has(position)) return [];
  const ads = await prisma.ad.findMany({
    where: { active: true, position: position as AdPosition },
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
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
  });

  const filtered = pool.filter((c) => c.category && !exclude.has(c.category.slug));
  // Hero carousel: all editor-"featured" stories, newest-first (pool is
  // ordered publishedAt desc), capped. Fall back to the single newest article
  // when nothing is featured, so the hero is never empty.
  const FEATURED_MAX = 6;
  let featuredSrc = filtered.filter((c) => c.featured).slice(0, FEATURED_MAX);
  if (featuredSrc.length === 0 && filtered[0]) featuredSrc = [filtered[0]];
  if (featuredSrc.length === 0) return null;

  const featured = featuredSrc.map(toAFArticle);
  const featuredIds = new Set(featuredSrc.map((c) => c.id));
  const latest = filtered
    .filter((c) => !featuredIds.has(c.id))
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
        select: {
          id: true,
          title: true,
          slug: true,
          // Used by the district-grid lead card. Without these the UI was
          // falling through to /logo-icon.png placeholders even when the
          // article had a real featured image saved on Content.
          featuredImage: true,
          // articleHref() needs constituency.district.slug for the
          // /[district]/[constituency]/<slug>-<id8> canonical URL.
          constituency: { select: { slug: true, district: { select: { slug: true } } } },
        },
      });
      return {
        name: d.name,
        slug: d.slug,
        articles: arts.map((a) => ({
          id: a.id,
          title: a.title,
          slug: a.slug || "",
          featuredImage: a.featuredImage,
          constituency: a.constituency,
        })),
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
    featured,
    districts: districtArticles
      .filter((d) => d.articles.length > 0)
      .sort((a, b) => b.articles.length - a.articles.length),
    breaking: breakingRows.map((b) => ({ id: b.id, text: b.title })),
    latest,
  };
}

// --- SectionBand ---

// Pull the latest published articles for one category slug (primary OR
// cross-listed). Shared by the band's default panel and each filter tab.
function fetchBandCategoryArticles(slug: string) {
  return prisma.content.findMany({
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
      category: { select: { name: true, slug: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
  });
}

type BandArt = Awaited<ReturnType<typeof fetchBandCategoryArticles>>[number];

// Slice a category's articles into the band's lead + grid + trending panel.
function buildBandPanel(
  arts: BandArt[],
  config: z.infer<typeof sectionBandConfig>,
) {
  const lead = arts[0] ? toBandArticle(arts[0]) : null;
  const grid = arts.slice(1, 1 + config.gridCount).map(toBandArticle);
  const trending = [...arts]
    .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
    .slice(0, config.trendingCount)
    .map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug || "",
      publishedAt: a.publishedAt?.toISOString() || null,
      category: a.category?.slug ? { slug: a.category.slug } : null,
      constituency: a.constituency ?? null,
    }));
  return { lead, grid, trending };
}

// A tab filters the band to a category. The slug comes from the explicit
// `categorySlug` field or is parsed from a `/category/<slug>` href.
function tabCategorySlug(tab: { href: string; categorySlug?: string }): string | null {
  if (tab.categorySlug) return tab.categorySlug;
  const m = tab.href.match(/^\/category\/([^/?#]+)/);
  return m ? m[1] : null;
}

export async function fetchSectionBand(
  config: z.infer<typeof sectionBandConfig>,
  ctx: PageContext,
) {
  // Pass-through mode: when the config omits brand / brandHref / categorySlug
  // the block reads them from the page context (Standard Category template).
  const slug = config.categorySlug || ctx.categorySlug;
  if (!slug) return null;

  // Every distinct category the band needs: its own + one per filter tab.
  // A tab whose slug matches the band's own category has nothing to filter,
  // so it stays a plain navigation link (no panel fetched).
  const tabSlugs = config.tabs.map(tabCategorySlug);
  const extraSlugs = Array.from(
    new Set(tabSlugs.filter((s): s is string => Boolean(s) && s !== slug)),
  );

  const [defaultArts, cat, ...extraArts] = await Promise.all([
    fetchBandCategoryArticles(slug),
    config.brand ? Promise.resolve(null) : prisma.category.findUnique({ where: { slug }, select: { name: true } }),
    ...extraSlugs.map((s) => fetchBandCategoryArticles(s)),
  ]);

  const brand = config.brand || cat?.name || slug;
  // brandHref may be persisted as a legacy "/category/<slug>" in the DB config;
  // normalize it (and tab hrefs below) to the bare slug.
  const brandHref = config.brandHref ? normalizeCategoryHref(config.brandHref) : categoryHref(slug);

  const defaultPanel = buildBandPanel(defaultArts, config);
  if (!defaultPanel.lead) return null;

  // Map extra category slug → its fetched articles for tab-panel assembly.
  const artsBySlug = new Map<string, BandArt[]>();
  extraSlugs.forEach((s, i) => artsBySlug.set(s, extraArts[i]));

  // A tab pointing at a *distinct* category becomes an in-place filter - even
  // when that category is empty, so the band can show an "empty" state instead
  // of navigating away (panel.lead === null signals empty to SectionBand). A
  // tab whose slug matches the band's own category has nothing to filter, so it
  // degrades to a plain link (panel: null).
  const tabs = config.tabs.map((t, i) => {
    const tslug = tabSlugs[i];
    const isDistinct = Boolean(tslug) && tslug !== slug;
    const panel = isDistinct ? buildBandPanel(artsBySlug.get(tslug!) ?? [], config) : null;
    return { label: t.label, href: normalizeCategoryHref(t.href), panel };
  });

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
    tabs,
    lead: defaultPanel.lead,
    grid: defaultPanel.grid,
    trending: defaultPanel.trending,
    cartoon,
  };
}

// --- CinemaBand ---

// Cinema sub-genre tabs → the category each one filters to. Mirrors the tabs
// hardcoded in CinemaBand and the /cinema page. `href` is the no-JS / SEO
// fallback target; `slug` drives the in-place filter panel.
const CINEMA_TABS: { key: string; label: string; slug: string; href: string }[] = [
  { key: "tollywood", label: "టాలీవుడ్", slug: "tollywood", href: "/cinema?t=tollywood" },
  { key: "bollywood", label: "బాలీవుడ్", slug: "bollywood", href: "/cinema?t=bollywood" },
  { key: "hollywood", label: "హాలీవుడ్", slug: "hollywood", href: "/cinema?t=hollywood" },
  { key: "tv", label: "టీవీ", slug: "tv", href: "/cinema?t=tv" },
  { key: "reviews", label: "రివ్యూలు", slug: "movie-reviews", href: "/cinema?t=reviews" },
];

export async function fetchCinemaBand(
  config: z.infer<typeof cinemaBandConfig>,
  _ctx: PageContext,
) {
  const [pool, ...tabArts] = await Promise.all([
    prisma.content.findMany({
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
    }),
    ...CINEMA_TABS.map((t) => fetchBandCategoryArticles(t.slug)),
  ]);
  if (!pool[0]) return null;

  const reviewsSrc = pool.filter((c) => c.category?.slug === "movie-reviews");

  // Each tab is an in-place filter panel (lead + grid). When its category is
  // empty, panel.lead is null - CinemaBand shows an "empty" state in place
  // rather than navigating away.
  const tabs = CINEMA_TABS.map((t, i) => {
    const arts = tabArts[i];
    const panel = {
      lead: arts[0] ? toBandArticle(arts[0]) : null,
      grid: arts.slice(1, 1 + config.gridCount).map(toBandArticle),
    };
    return { label: t.label, href: t.href, panel };
  });

  return {
    lead: toBandArticle(pool[0]),
    grid: pool.slice(1, 1 + config.gridCount).map(toBandArticle),
    tabs,
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

export async function fetchLoopItems(
  config: z.infer<typeof loopConfig>,
): Promise<import("./types").LoopItem[]> {
  const rows = await prisma.content.findMany({
    where: {
      type: "ARTICLE",
      status: "PUBLISHED",
      ...(config.categorySlug ? { category: { slug: config.categorySlug } } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: config.count,
    select: {
      id: true,
      title: true,
      summary: true,
      slug: true,
      featuredImage: true,
      publishedAt: true,
      category: { select: { name: true, slug: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    featuredImage: r.featuredImage,
    publishedAtIso: r.publishedAt ? r.publishedAt.toISOString() : null,
    categoryName: r.category?.name ?? null,
    href: articleHref(r as never),
  }));
}

export async function fetchLatestNews(
  config: z.infer<typeof latestNewsConfig>,
  _ctx: PageContext,
) {
  const rows = await prisma.content.findMany({
    where: {
      type: "ARTICLE",
      status: "PUBLISHED",
      ...(config.categorySlug ? { category: { slug: config.categorySlug } } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: config.count,
    select: {
      id: true,
      title: true,
      slug: true,
      featuredImage: true,
      publishedAt: true,
      category: { select: { name: true, slug: true } },
      constituency: { select: { slug: true, district: { select: { slug: true } } } },
    },
  });
  return {
    articles: rows.map((r) => ({
      id: r.id,
      title: r.title,
      href: articleHref(r as never),
      featuredImage: r.featuredImage,
      categoryName: r.category?.name ?? null,
      publishedAtIso: r.publishedAt ? r.publishedAt.toISOString() : null,
    })),
  };
}

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
          // article's OWN primary category (not col.slug, which may be a
          // cross-listed match) + constituency, so links are canonical.
          category: { select: { slug: true } },
          constituency: { select: { slug: true, district: { select: { slug: true } } } },
        },
      });
      const toCol = (a: typeof arts[number]) => ({
        id: a.id,
        title: a.title,
        slug: a.slug || "",
        summary: a.summary,
        featuredImage: a.featuredImage,
        category: a.category?.slug ? { slug: a.category.slug } : null,
        constituency: a.constituency ?? null,
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
    select: { id: true, slug: true, title: true, featuredImage: true, payload: true },
  });
  return {
    photos: rows.map((r) => {
      const p = (r.payload as Record<string, unknown> | null) || {};
      const photos = Array.isArray(p.photos) ? (p.photos as unknown[]) : [];
      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        image: r.featuredImage || "",
        count: photos.length,
      };
    }),
  };
}
