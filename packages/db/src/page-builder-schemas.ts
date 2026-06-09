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

// Latest-news feed: newest published articles, optionally scoped to a category.
// Renders an auto-fitting card grid (works at any width, incl. inside Columns).
export const latestNewsConfig = z
  .object({
    count: z.number().int().min(1).max(60).default(12),
    // Blank ⇒ latest across all categories. Set to scope to one category.
    categorySlug: z.string().optional(),
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

// --- Dynamic primitives + Loop (Breakdance/Bricks-style query loop) ---
// A Loop fetches a list (latest news) and repeats its inner primitive blocks
// once per item. Heading/Image/Text primitives bind to a field of the current
// loop item (or render a static value).
export const BINDING_FIELDS = ["static", "title", "summary", "image", "date", "category", "link"] as const;
export const bindingFieldSchema = z.enum(BINDING_FIELDS);

export const headingConfig = z
  .object({
    binding: bindingFieldSchema.default("title"),
    staticText: z.string().optional(),
    level: z.enum(["h2", "h3", "h4"]).default("h3"),
    linkToItem: z.boolean().default(true),
  })
  .strict();

export const imageConfig = z
  .object({
    binding: bindingFieldSchema.default("image"),
    staticUrl: z.string().optional(),
    linkToItem: z.boolean().default(true),
  })
  .strict();

export const textConfig = z
  .object({
    binding: bindingFieldSchema.default("summary"),
    staticText: z.string().optional(),
  })
  .strict();

export const loopConfig = z
  .object({
    source: z.literal("latest-news").default("latest-news"),
    count: z.number().int().min(1).max(60).default(12),
    categorySlug: z.string().optional(),
    columns: z.number().int().min(1).max(4).default(1),
    gap: z.number().int().min(0).max(64).default(16),
  })
  .strict();

// --- Block discriminated union ---

const baseBlock = {
  id: z.string().min(1),
  mobileVariant: mobileVariantSchema.default("show"),
};

// Leaf block members - everything EXCEPT the Columns container. A Columns block
// may only hold leaf blocks (one level of nesting; no Columns-in-Columns), which
// keeps the schema non-recursive and the renderer/editor simple.
const adHeaderLeaderboardBlock = z.object({ ...baseBlock, type: z.literal("AdHeaderLeaderboard"), config: adHeaderLeaderboardConfig });
const aboveFoldBlock = z.object({ ...baseBlock, type: z.literal("AboveFold"), config: aboveFoldConfig });
const adBannerMidBlock = z.object({ ...baseBlock, type: z.literal("AdBannerMid"), config: adBannerMidConfig });
const sectionBandBlock = z.object({ ...baseBlock, type: z.literal("SectionBand"), config: sectionBandConfig });
const cinemaBandBlock = z.object({ ...baseBlock, type: z.literal("CinemaBand"), config: cinemaBandConfig });
const videoSectionBlock = z.object({ ...baseBlock, type: z.literal("VideoSection"), config: videoSectionConfig });
const latestNewsBlock = z.object({ ...baseBlock, type: z.literal("LatestNews"), config: latestNewsConfig });
const categoryPairBlock = z.object({ ...baseBlock, type: z.literal("CategoryPair"), config: categoryPairConfig });
const webStoriesBlock = z.object({ ...baseBlock, type: z.literal("WebStories"), config: webStoriesConfig });
const photoGalleryBlock = z.object({ ...baseBlock, type: z.literal("PhotoGallery"), config: photoGalleryConfig });
const adLeaderboardBlock = z.object({ ...baseBlock, type: z.literal("AdLeaderboard"), config: adLeaderboardConfig });
const adInFeedBannerBlock = z.object({ ...baseBlock, type: z.literal("AdInFeedBanner"), config: adInFeedBannerConfig });
// Synthetic: inlines a CompositeBlock.blocks at render time.
const compositeBlock = z.object({ ...baseBlock, type: z.literal("Composite"), compositeId: z.string().min(1) });

export const leafBlockSchema = z.discriminatedUnion("type", [
  adHeaderLeaderboardBlock, aboveFoldBlock, adBannerMidBlock, sectionBandBlock,
  cinemaBandBlock, videoSectionBlock, latestNewsBlock, categoryPairBlock, webStoriesBlock,
  photoGalleryBlock, adLeaderboardBlock, adInFeedBannerBlock, compositeBlock,
]);
export type LeafBlock = z.infer<typeof leafBlockSchema>;

// Columns container - N columns, each an ordered list of leaf blocks. Rendered
// as a flex/grid row; stacks vertically on mobile when stackMobile is set.
export const columnSchema = z
  .object({
    id: z.string().min(1),
    blocks: z.array(leafBlockSchema).default([]),
  })
  .strict();

export const columnsConfig = z
  .object({
    columns: z.array(columnSchema).min(1).max(4),
    gap: z.number().int().min(0).max(64).default(24),
    stackMobile: z.boolean().default(true),
  })
  .strict();

const columnsBlock = z.object({ ...baseBlock, type: z.literal("Columns"), config: columnsConfig });

// Dynamic primitives - only meaningful inside a Loop (they bind to the current
// item). They're valid blockSchema members so the renderer/types accept them,
// but they're NOT in BUILTIN_BLOCK_TYPES, so the palette doesn't offer them at
// top level; they're added via the Loop's panel.
const headingBlock = z.object({ ...baseBlock, type: z.literal("Heading"), config: headingConfig });
const imageBlock = z.object({ ...baseBlock, type: z.literal("Image"), config: imageConfig });
const textBlock = z.object({ ...baseBlock, type: z.literal("Text"), config: textConfig });

export const primitiveBlockSchema = z.discriminatedUnion("type", [headingBlock, imageBlock, textBlock]);
export type PrimitiveBlock = z.infer<typeof primitiveBlockSchema>;

// Loop container - holds primitive blocks as its per-item template.
const loopBlock = z.object({
  ...baseBlock,
  type: z.literal("Loop"),
  config: loopConfig,
  blocks: z.array(primitiveBlockSchema).default([]),
});

export const blockSchema = z.discriminatedUnion("type", [
  adHeaderLeaderboardBlock, aboveFoldBlock, adBannerMidBlock, sectionBandBlock,
  cinemaBandBlock, videoSectionBlock, latestNewsBlock, categoryPairBlock, webStoriesBlock,
  photoGalleryBlock, adLeaderboardBlock, adInFeedBannerBlock, compositeBlock,
  columnsBlock, headingBlock, imageBlock, textBlock, loopBlock,
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
  "LatestNews",
  "CategoryPair",
  "WebStories",
  "PhotoGallery",
  "AdLeaderboard",
  "AdInFeedBanner",
  "Columns",
  "Loop",
] as const satisfies readonly BlockType[];

export type BuiltinBlockType = (typeof BUILTIN_BLOCK_TYPES)[number];
