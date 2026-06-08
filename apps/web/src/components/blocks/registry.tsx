// Page Builder (Spec #2) - block type registry.
// Maps each block.type → { component, fetcher }. Composite (synthetic type)
// has no entry here; the BlockRenderer handles it directly because cycle
// detection (F2 #169) needs cross-block context.

import type { BlockType, BuiltinBlockType } from "@rayalaseema/db";
import {
  AdHeaderLeaderboard,
  AdBannerMid,
  AdLeaderboard,
  AdInFeedBanner,
} from "@/components/ad-slots";
import { AboveFold } from "@/components/above-fold";
import { SectionBand } from "@/components/section-band";
import { CinemaBand } from "@/components/cinema-band";
import { VideoSection } from "@/components/video-section";
import { CategoryColumn, CategoryPair } from "@/components/category-column";
import { WebStories } from "@/components/web-stories";
import { PhotoGallery } from "@/components/photo-gallery";
import type { PageContext } from "./types";
import * as F from "./fetchers";

type AnyComponent = React.ComponentType<Record<string, unknown>>;
type Fetcher = (
  config: Record<string, unknown>,
  ctx: PageContext,
) => Promise<Record<string, unknown> | null>;

// CategoryPair is special - it accepts children. Wrap so the registry sees a
// component with `{ columns: [...] }` props that internally maps to children.
function CategoryPairBlock({
  columns,
}: {
  columns: Array<{
    title: string;
    slug: string;
    lead: { id: string; title: string; slug: string; summary: string | null; featuredImage: string | null };
    items: Array<{ id: string; title: string; slug: string; summary: string | null; featuredImage: string | null }>;
  }>;
}) {
  if (columns.length === 0) return null;
  return (
    <CategoryPair>
      {columns.map((c) => (
        <CategoryColumn key={c.slug} title={c.title} slug={c.slug} lead={c.lead} items={c.items} />
      ))}
    </CategoryPair>
  );
}

interface RegistryEntry {
  component: AnyComponent;
  fetcher: Fetcher;
  // Returns `true` to suppress render when the fetcher result has no data
  // worth showing (e.g. zero articles for a SectionBand). Defaults to a
  // null check.
  hideWhenEmpty?: (data: unknown) => boolean;
}

// Columns (container) is NOT registered here - like Composite, BlockRenderer
// handles it directly (it lays out + recurses into its columns' blocks rather
// than fetching data).
export const REGISTRY: Record<Exclude<BuiltinBlockType, "Columns">, RegistryEntry> = {
  AdHeaderLeaderboard: {
    component: AdHeaderLeaderboard as AnyComponent,
    fetcher: (config) => F.fetchAdHeaderLeaderboard(config as never) as never,
  },
  AboveFold: {
    component: AboveFold as AnyComponent,
    fetcher: (config, ctx) => F.fetchAboveFold(config as never, ctx) as never,
  },
  AdBannerMid: {
    component: AdBannerMid as AnyComponent,
    fetcher: (config) => F.fetchAdBannerMid(config as never) as never,
  },
  SectionBand: {
    component: SectionBand as AnyComponent,
    fetcher: (config, ctx) => F.fetchSectionBand(config as never, ctx) as never,
  },
  CinemaBand: {
    component: CinemaBand as AnyComponent,
    fetcher: (config, ctx) => F.fetchCinemaBand(config as never, ctx) as never,
  },
  VideoSection: {
    component: VideoSection as AnyComponent,
    fetcher: (config, ctx) => F.fetchVideoSection(config as never, ctx) as never,
    hideWhenEmpty: (data) =>
      !data || (Array.isArray((data as { videos?: unknown[] }).videos) && (data as { videos: unknown[] }).videos.length === 0),
  },
  CategoryPair: {
    component: CategoryPairBlock as unknown as AnyComponent,
    fetcher: (config, ctx) => F.fetchCategoryPair(config as never, ctx) as never,
    hideWhenEmpty: (data) =>
      !data || (data as { columns: unknown[] }).columns.length === 0,
  },
  WebStories: {
    component: WebStories as AnyComponent,
    fetcher: (config, ctx) => F.fetchWebStories(config as never, ctx) as never,
    hideWhenEmpty: (data) =>
      !data || (data as { items: unknown[] }).items.length === 0,
  },
  PhotoGallery: {
    component: PhotoGallery as AnyComponent,
    fetcher: (config, ctx) => F.fetchPhotoGallery(config as never, ctx) as never,
    hideWhenEmpty: (data) =>
      !data || (data as { photos: unknown[] }).photos.length === 0,
  },
  AdLeaderboard: {
    component: AdLeaderboard as AnyComponent,
    fetcher: (config) => F.fetchAdLeaderboard(config as never) as never,
  },
  AdInFeedBanner: {
    component: AdInFeedBanner as AnyComponent,
    fetcher: (config) => F.fetchAdInFeedBanner(config as never) as never,
  },
};

export function isBuiltinBlockType(
  type: BlockType,
): type is Exclude<BuiltinBlockType, "Columns"> {
  return type !== "Composite" && type !== "Columns" && type in REGISTRY;
}
