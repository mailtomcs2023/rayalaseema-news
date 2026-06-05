// Page Builder (Spec #2) - Zod schemas for layout JSON and per-block configs.
// Spec: docs/superpowers/specs/2026-05-25-page-builder-design.md
//
// Layout JSON shape (stored in Template.layout / Template.draftLayout):
//   { version: 1, blocks: Block[] }
//
// Each Block is a discriminated union on `type`. Built-in types map 1:1 to
// React components under apps/web/src/components/*. The synthetic `Composite`
// type inlines a CompositeBlock.blocks array at render time.

import { z } from "zod";

export const MOBILE_VARIANTS = ["show", "hide", "stack-below", "compact"] as const;
export const mobileVariantSchema = z.enum(MOBILE_VARIANTS);
export type MobileVariant = z.infer<typeof mobileVariantSchema>;

// --- Ad position enum (matches Prisma AdPosition + the legal slot strings) ---
export const adPositionSchema = z.enum([
  "HEADER_LEFT",
  "HEADER_RIGHT",
  "HEADER_LEADERBOARD",
  "BANNER_MID",
  "SIDEBAR_SQUARE",
  "SIDEBAR_TALL",
  "LEADERBOARD",
  "IN_FEED",
  "VERTICAL_STRIP",
]);

// --- Per-block-type config schemas ---

export const adHeaderLeaderboardConfig = z
  .object({ position: adPositionSchema.default("HEADER_LEADERBOARD") })
  .strict();

export const aboveFoldConfig = z
  .object({
    districtCount: z.number().int().min(0).max(20).default(6),
    latestCount: z.number().int().min(0).max(50).default(10),
    excludeCategories: z.array(z.string()).default([]),
  })
  .strict();

export const adBannerMidConfig = z
  .object({ position: adPositionSchema.default("BANNER_MID") })
  .strict();

export const sectionBandTab = z
  .object({
    label: z.string().min(1),
    href: z.string().min(1),
    // When set (or derivable from a `/category/<slug>` href), clicking the tab
    // filters the band IN PLACE to this category's latest articles - no page
    // navigation. If the resolved slug equals the band's own category the tab
    // stays a plain link (nothing to filter). See fetchSectionBand + SectionBand.
    categorySlug: z.string().optional(),
  })
  .strict();

export const sectionBandConfig = z
  .object({
    // brand/brandHref/categorySlug omitted ⇒ resolved from page context
    // (e.g. /category/sports → brand from Category.name, slug from URL).
    // Standard Category template uses this pass-through mode so one template
    // serves every /category/* path.
    brand: z.string().optional(),
    brandHref: z.string().optional(),
    categorySlug: z.string().optional(),
    tabs: z.array(sectionBandTab).default([]),
    leadCount: z.number().int().min(0).max(10).default(1),
    gridCount: z.number().int().min(0).max(20).default(4),
    trendingCount: z.number().int().min(0).max(20).default(6),
    showCartoon: z.boolean().default(false),
    showScores: z.boolean().default(false),
  })
  .strict();

export const cinemaBandConfig = z
  .object({
    leadCount: z.number().int().min(0).max(10).default(1),
    gridCount: z.number().int().min(0).max(20).default(4),
    reviewsCount: z.number().int().min(0).max(20).default(4),
    includeMovieReviews: z.boolean().default(true),
  })
  .strict();

export const videoSectionConfig = z
  .object({
    count: z.number().int().min(0).max(30).default(6),
    featuredOnly: z.boolean().default(false),
  })
  .strict();

export const categoryPairColumn = z
  .object({
    title: z.string().min(1),
    slug: z.string().min(1),
    leadCount: z.number().int().min(0).max(5).default(1),
    itemsCount: z.number().int().min(0).max(20).default(4),
  })
  .strict();

export const categoryPairConfig = z
  .object({
    columns: z.array(categoryPairColumn).min(1).max(4),
  })
  .strict();

export const webStoriesConfig = z
  .object({ count: z.number().int().min(0).max(20).default(8) })
  .strict();

export const photoGalleryConfig = z
  .object({ count: z.number().int().min(0).max(20).default(6) })
  .strict();

export const adLeaderboardConfig = z
  .object({ position: adPositionSchema.default("LEADERBOARD") })
  .strict();

export const adInFeedBannerConfig = z
  .object({ position: adPositionSchema.default("IN_FEED") })
  .strict();

// --- Block discriminated union ---

const baseBlock = {
  id: z.string().min(1),
  mobileVariant: mobileVariantSchema.default("show"),
};

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ ...baseBlock, type: z.literal("AdHeaderLeaderboard"), config: adHeaderLeaderboardConfig }),
  z.object({ ...baseBlock, type: z.literal("AboveFold"), config: aboveFoldConfig }),
  z.object({ ...baseBlock, type: z.literal("AdBannerMid"), config: adBannerMidConfig }),
  z.object({ ...baseBlock, type: z.literal("SectionBand"), config: sectionBandConfig }),
  z.object({ ...baseBlock, type: z.literal("CinemaBand"), config: cinemaBandConfig }),
  z.object({ ...baseBlock, type: z.literal("VideoSection"), config: videoSectionConfig }),
  z.object({ ...baseBlock, type: z.literal("CategoryPair"), config: categoryPairConfig }),
  z.object({ ...baseBlock, type: z.literal("WebStories"), config: webStoriesConfig }),
  z.object({ ...baseBlock, type: z.literal("PhotoGallery"), config: photoGalleryConfig }),
  z.object({ ...baseBlock, type: z.literal("AdLeaderboard"), config: adLeaderboardConfig }),
  z.object({ ...baseBlock, type: z.literal("AdInFeedBanner"), config: adInFeedBannerConfig }),
  // Synthetic: inlines a CompositeBlock.blocks at render time.
  z.object({
    ...baseBlock,
    type: z.literal("Composite"),
    compositeId: z.string().min(1),
  }),
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];

// --- Layout (top-level) ---

export const layoutSchema = z
  .object({
    version: z.literal(1),
    blocks: z.array(blockSchema),
  })
  .strict();

export type Layout = z.infer<typeof layoutSchema>;

// CompositeBlock.blocks shape - same as layout.blocks but stored standalone.
// Cycle detection in the renderer (#169) prevents Composite-of-Composite loops.
export const compositeBlocksSchema = z.array(blockSchema);
export type CompositeBlocks = z.infer<typeof compositeBlocksSchema>;

// Built-in (non-Composite) block type list - used by the palette + registry.
export const BUILTIN_BLOCK_TYPES = [
  "AdHeaderLeaderboard",
  "AboveFold",
  "AdBannerMid",
  "SectionBand",
  "CinemaBand",
  "VideoSection",
  "CategoryPair",
  "WebStories",
  "PhotoGallery",
  "AdLeaderboard",
  "AdInFeedBanner",
] as const satisfies readonly BlockType[];

export type BuiltinBlockType = (typeof BUILTIN_BLOCK_TYPES)[number];
