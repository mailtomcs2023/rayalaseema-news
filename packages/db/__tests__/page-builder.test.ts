// I1 (#172) - Page Builder unit tests. Runs under bun test:
//   bun test packages/db
//
// Covers:
//   - matchPattern: exact, single-segment *, recursive **
//   - resolveAssignment: priority DESC, pattern-length tie-break, active +
//     published filtering
//   - layoutSchema: round-trip of a typical block tree; rejection of bad
//     mobileVariant, bad SectionBand config, unknown block type
//   - compositeBlocksSchema: empty array + nested-valid case

import { describe, test, expect } from "bun:test";
import {
  matchPattern,
  resolveAssignment,
  layoutSchema,
  compositeBlocksSchema,
  blockSchema,
} from "../src";

// --- matchPattern ---

describe("matchPattern", () => {
  test("exact match", () => {
    expect(matchPattern("/", "/")).toBe(true);
    expect(matchPattern("/category/sports", "/category/sports")).toBe(true);
    expect(matchPattern("/category/sports", "/category/politics")).toBe(false);
  });

  test("trailing slash normalised", () => {
    expect(matchPattern("/category/sports", "/category/sports/")).toBe(true);
    // Root keeps its slash.
    expect(matchPattern("/", "/")).toBe(true);
  });

  test("single-segment * matches one segment, not nested", () => {
    expect(matchPattern("/category/*", "/category/sports")).toBe(true);
    expect(matchPattern("/category/*", "/category/politics")).toBe(true);
    expect(matchPattern("/category/*", "/category/movie-reviews")).toBe(true);
    expect(matchPattern("/category/*", "/category/sports/sub")).toBe(false);
    // Trailing slash on the URL is stripped before matching, so "/category/"
    // becomes "/category" which doesn't match "^/category/[^/]*$".
    expect(matchPattern("/category/*", "/category/")).toBe(false);
  });

  test("recursive ** matches across slashes", () => {
    expect(matchPattern("/category/**", "/category/sports/sub/2026")).toBe(true);
    expect(matchPattern("/**", "/anything/at/all")).toBe(true);
  });

  test("ignores other paths entirely", () => {
    expect(matchPattern("/", "/category/sports")).toBe(false);
    expect(matchPattern("/category/sports", "/")).toBe(false);
  });
});

// --- resolveAssignment ---

describe("resolveAssignment", () => {
  const make = (pattern: string, priority: number, isPublished = true, active = true) => ({
    pattern,
    priority,
    active,
    template: { isPublished },
  });

  test("higher priority wins", () => {
    const winner = resolveAssignment(
      [make("/category/*", 10), make("/category/movie-reviews", 100)],
      "/category/movie-reviews",
    );
    expect(winner?.pattern).toBe("/category/movie-reviews");
  });

  test("longer pattern wins on equal priority", () => {
    const winner = resolveAssignment(
      [make("/category/*", 50), make("/category/movie-reviews", 50)],
      "/category/movie-reviews",
    );
    expect(winner?.pattern).toBe("/category/movie-reviews");
  });

  test("skips inactive assignments", () => {
    const winner = resolveAssignment(
      [make("/category/sports", 100, true, false), make("/category/*", 10)],
      "/category/sports",
    );
    expect(winner?.pattern).toBe("/category/*");
  });

  test("skips unpublished templates", () => {
    const winner = resolveAssignment(
      [make("/category/sports", 100, false), make("/category/*", 10)],
      "/category/sports",
    );
    expect(winner?.pattern).toBe("/category/*");
  });

  test("returns null when nothing matches", () => {
    const winner = resolveAssignment(
      [make("/category/*", 10)],
      "/admin/dashboard",
    );
    expect(winner).toBeNull();
  });
});

// --- layoutSchema ---

describe("layoutSchema", () => {
  test("round-trips a homepage-like layout", () => {
    const layout = {
      version: 1,
      blocks: [
        { id: "rvb_1", type: "ReturnVisitBanner", config: {}, mobileVariant: "show" },
        { id: "ad_1", type: "AdHeaderLeaderboard", config: { position: "HEADER_LEADERBOARD" }, mobileVariant: "show" },
        {
          id: "sb_1",
          type: "SectionBand",
          mobileVariant: "show",
          config: {
            brand: "Politics",
            brandHref: "/category/politics",
            categorySlug: "politics",
            tabs: [],
            leadCount: 1,
            gridCount: 4,
            trendingCount: 6,
            showCartoon: true,
            showScores: false,
          },
        },
        {
          id: "comp_1",
          type: "Composite",
          compositeId: "cmp_xyz",
          mobileVariant: "show",
        },
      ],
    };
    const result = layoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
  });

  test("rejects unknown block type", () => {
    const r = layoutSchema.safeParse({
      version: 1,
      blocks: [{ id: "x", type: "NotABlock", config: {}, mobileVariant: "show" }],
    });
    expect(r.success).toBe(false);
  });

  test("rejects invalid mobileVariant", () => {
    const r = layoutSchema.safeParse({
      version: 1,
      blocks: [{ id: "x", type: "ReturnVisitBanner", config: {}, mobileVariant: "explode" }],
    });
    expect(r.success).toBe(false);
  });

  test("rejects Composite without compositeId", () => {
    const r = blockSchema.safeParse({
      id: "x",
      type: "Composite",
      mobileVariant: "show",
    });
    expect(r.success).toBe(false);
  });

  test("rejects SectionBand with empty tab label", () => {
    const r = layoutSchema.safeParse({
      version: 1,
      blocks: [
        {
          id: "sb",
          type: "SectionBand",
          mobileVariant: "show",
          config: {
            tabs: [{ label: "", href: "/x" }],
            leadCount: 1,
            gridCount: 1,
            trendingCount: 1,
            showCartoon: false,
            showScores: false,
          },
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  test("rejects CategoryPair with zero columns", () => {
    const r = layoutSchema.safeParse({
      version: 1,
      blocks: [
        {
          id: "cp",
          type: "CategoryPair",
          mobileVariant: "show",
          config: { columns: [] },
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});

// --- compositeBlocksSchema ---

describe("compositeBlocksSchema", () => {
  test("accepts empty array", () => {
    expect(compositeBlocksSchema.safeParse([]).success).toBe(true);
  });

  test("accepts a valid block list", () => {
    const r = compositeBlocksSchema.safeParse([
      { id: "a", type: "ReturnVisitBanner", config: {}, mobileVariant: "show" },
      { id: "b", type: "AdLeaderboard", config: { position: "LEADERBOARD" }, mobileVariant: "show" },
    ]);
    expect(r.success).toBe(true);
  });

  test("rejects non-array input", () => {
    expect(compositeBlocksSchema.safeParse({} as never).success).toBe(false);
  });
});
