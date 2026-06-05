// Page Builder (Spec #2) - seed initial templates + assignments so that
// after Phase C lands the public site renders identically to the
// pre-Spec-#2 hardcoded layout. Idempotent: skips templates whose slug
// already exists.
//
//   1. "default-homepage"        → "/"                       priority 100
//   2. "movie-reviews-category"  → "/category/movie-reviews" priority 100
//   3. "standard-category"       → "/category/*"             priority 10
//
// Run via: bunx tsx packages/db/scripts/seed-templates.ts
// Production deploy.yml wires this in after the e-paper seed step.

import { prisma } from "../src";
import { randomBytes } from "crypto";
import type { Layout } from "../src/page-builder-schemas";

function blkId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

function pickCreatorEmail(): Promise<{ id: string; email: string } | null> {
  return prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
}

// --- Layouts ---

const DEFAULT_HOMEPAGE: Layout = {
  version: 1,
  blocks: [
    {
      id: blkId("ad"),
      type: "AdHeaderLeaderboard",
      config: { position: "HEADER_LEADERBOARD" },
      mobileVariant: "show",
    },
    {
      id: blkId("af"),
      type: "AboveFold",
      config: {
        districtCount: 8,
        latestCount: 8,
        excludeCategories: ["rasi-phalalu", "weather", "navyaseema"],
      },
      mobileVariant: "show",
    },
    {
      id: blkId("ad"),
      type: "AdBannerMid",
      config: { position: "BANNER_MID" },
      mobileVariant: "show",
    },
    {
      id: blkId("sb"),
      type: "SectionBand",
      config: {
        brand: "రాజకీయం",
        brandHref: "/category/politics",
        categorySlug: "politics",
        // Tabs filter the band in place (categorySlug) and link to the full
        // category page when JS is off. AP must point at andhra-pradesh, not
        // politics, or it would just re-show the band's own category.
        tabs: [
          { label: "ఆంధ్రప్రదేశ్", href: "/category/andhra-pradesh", categorySlug: "andhra-pradesh" },
          { label: "జాతీయం", href: "/category/national", categorySlug: "national" },
        ],
        leadCount: 1,
        gridCount: 4,
        trendingCount: 6,
        showCartoon: true,
        showScores: false,
      },
      mobileVariant: "show",
    },
    {
      id: blkId("cb"),
      type: "CinemaBand",
      config: { leadCount: 1, gridCount: 4, reviewsCount: 8, includeMovieReviews: true },
      mobileVariant: "show",
    },
    {
      id: blkId("vs"),
      type: "VideoSection",
      config: { count: 6, featuredOnly: false },
      mobileVariant: "show",
    },
    {
      id: blkId("sb"),
      type: "SectionBand",
      config: {
        brand: "క్రీడలు",
        brandHref: "/category/sports",
        categorySlug: "sports",
        // Filter the sports band in place by sub-category (cricket / ipl).
        tabs: [
          { label: "క్రికెట్", href: "/category/cricket", categorySlug: "cricket" },
          { label: "ఐపీఎల్", href: "/category/ipl", categorySlug: "ipl" },
        ],
        leadCount: 1,
        gridCount: 4,
        trendingCount: 6,
        showCartoon: false,
        showScores: true,
      },
      mobileVariant: "show",
    },
    {
      id: blkId("cp"),
      type: "CategoryPair",
      config: {
        columns: [
          { title: "జాతీయం", slug: "national", leadCount: 1, itemsCount: 4 },
          { title: "వాణిజ్యం", slug: "business", leadCount: 1, itemsCount: 4 },
        ],
      },
      mobileVariant: "show",
    },
    {
      id: blkId("cp"),
      type: "CategoryPair",
      config: {
        columns: [
          { title: "నేరం", slug: "crime", leadCount: 1, itemsCount: 4 },
          { title: "సాంకేతిక", slug: "technology", leadCount: 1, itemsCount: 4 },
        ],
      },
      mobileVariant: "show",
    },
    {
      id: blkId("ad"),
      type: "AdLeaderboard",
      config: { position: "LEADERBOARD" },
      mobileVariant: "show",
    },
    {
      id: blkId("cp"),
      type: "CategoryPair",
      config: {
        columns: [
          { title: "వ్యవసాయం", slug: "agriculture", leadCount: 1, itemsCount: 4 },
          { title: "అంతర్జాతీయం", slug: "international", leadCount: 1, itemsCount: 4 },
        ],
      },
      mobileVariant: "show",
    },
    {
      id: blkId("cp"),
      type: "CategoryPair",
      config: {
        columns: [
          { title: "విద్య", slug: "education", leadCount: 1, itemsCount: 4 },
          { title: "ఆరోగ్యం", slug: "health", leadCount: 1, itemsCount: 4 },
        ],
      },
      mobileVariant: "show",
    },
    {
      id: blkId("ws"),
      type: "WebStories",
      config: { count: 12 },
      mobileVariant: "show",
    },
    {
      id: blkId("pg"),
      type: "PhotoGallery",
      config: { count: 6 },
      mobileVariant: "show",
    },
    {
      id: blkId("ad"),
      type: "AdInFeedBanner",
      config: { position: "IN_FEED" },
      mobileVariant: "show",
    },
  ],
};

// Standard category - categorySlug omitted ⇒ resolved from PageContext.
const STANDARD_CATEGORY: Layout = {
  version: 1,
  blocks: [
    {
      id: blkId("ad"),
      type: "AdHeaderLeaderboard",
      config: { position: "HEADER_LEADERBOARD" },
      mobileVariant: "show",
    },
    {
      id: blkId("sb"),
      type: "SectionBand",
      config: {
        // brand + brandHref + categorySlug all left blank → fetcher pulls
        // them from the page context, so /category/sports renders with the
        // sports brand, /category/politics renders with politics, etc.
        tabs: [],
        leadCount: 1,
        gridCount: 4,
        trendingCount: 6,
        showCartoon: false,
        showScores: false,
      },
      mobileVariant: "show",
    },
    {
      id: blkId("ad"),
      type: "AdLeaderboard",
      config: { position: "LEADERBOARD" },
      mobileVariant: "show",
    },
  ],
};

const MOVIE_REVIEWS: Layout = {
  version: 1,
  blocks: [
    {
      id: blkId("ad"),
      type: "AdHeaderLeaderboard",
      config: { position: "HEADER_LEADERBOARD" },
      mobileVariant: "show",
    },
    {
      id: blkId("cb"),
      type: "CinemaBand",
      config: { leadCount: 1, gridCount: 6, reviewsCount: 12, includeMovieReviews: true },
      mobileVariant: "show",
    },
    {
      id: blkId("ad"),
      type: "AdLeaderboard",
      config: { position: "LEADERBOARD" },
      mobileVariant: "show",
    },
  ],
};

// --- Seed helpers ---

async function upsertTemplate(args: {
  slug: string;
  name: string;
  description: string;
  layout: Layout;
  createdById: string;
}): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.template.findUnique({ where: { slug: args.slug } });
  if (existing) {
    console.log(`  template "${args.slug}" already present - skip`);
    return { id: existing.id, created: false };
  }
  const t = await prisma.template.create({
    data: {
      slug: args.slug,
      name: args.name,
      description: args.description,
      layout: args.layout as unknown as object,
      isPublished: true,
      publishedAt: new Date(),
      createdById: args.createdById,
    },
  });
  console.log(`  ✓ created template "${args.slug}" (${t.id})`);
  return { id: t.id, created: true };
}

async function upsertAssignment(args: {
  templateId: string;
  pattern: string;
  priority: number;
}): Promise<void> {
  const existing = await prisma.templateAssignment.findUnique({
    where: { pattern_templateId: { pattern: args.pattern, templateId: args.templateId } },
  });
  if (existing) {
    console.log(`  assignment ${args.pattern} → ${args.templateId} already present - skip`);
    return;
  }
  await prisma.templateAssignment.create({
    data: {
      templateId: args.templateId,
      pattern: args.pattern,
      priority: args.priority,
      active: true,
    },
  });
  console.log(`  ✓ created assignment ${args.pattern} (priority ${args.priority})`);
}

// --- Entrypoint ---

async function main() {
  const creator = await pickCreatorEmail();
  if (!creator) {
    console.error("No ADMIN user found - cannot seed templates without a createdBy.");
    process.exit(1);
  }
  console.log(`Seeding page-builder templates as ${creator.email}`);

  const home = await upsertTemplate({
    slug: "default-homepage",
    name: "Default Homepage",
    description: "Pre-Spec-#2 hardcoded homepage layout, now editable.",
    layout: DEFAULT_HOMEPAGE,
    createdById: creator.id,
  });

  const std = await upsertTemplate({
    slug: "standard-category",
    name: "Standard Category",
    description: "Default layout for every /category/<slug> page.",
    layout: STANDARD_CATEGORY,
    createdById: creator.id,
  });

  const movie = await upsertTemplate({
    slug: "movie-reviews-category",
    name: "Movie Reviews Category",
    description: "Variant of Standard Category that swaps the news rail for CinemaBand.",
    layout: MOVIE_REVIEWS,
    createdById: creator.id,
  });

  await upsertAssignment({ templateId: home.id, pattern: "/", priority: 100 });
  await upsertAssignment({
    templateId: movie.id,
    pattern: "/category/movie-reviews",
    priority: 100,
  });
  await upsertAssignment({ templateId: std.id, pattern: "/category/*", priority: 10 });

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
