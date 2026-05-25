// Spec #3 G1 #186 — menu schema + resolver unit tests.
//   bun test packages/db
//
// Covers:
//   - all 4 target shapes accepted
//   - depth-3 (child-of-child) structurally rejected
//   - bad URL / missing slug / unknown key
//   - resolveItemHref returns the right /article|/video|… prefix
import { describe, test, expect } from "bun:test";
import { safeValidateMenuItems, resolveItemHref, type MenuItemTarget } from "../src/menu-schemas";

const id = (s: string) => s.padEnd(8, "0");

describe("menuItemsSchema — target shapes", () => {
  test("accepts CATEGORY", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "Sports", target: { type: "CATEGORY", categorySlug: "sports" } },
    ]);
    expect(r.success).toBe(true);
  });

  test("accepts INTERNAL_URL starting with /", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "About", target: { type: "INTERNAL_URL", url: "/about" } },
    ]);
    expect(r.success).toBe(true);
  });

  test("rejects INTERNAL_URL not starting with /", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "Bad", target: { type: "INTERNAL_URL", url: "about" } },
    ]);
    expect(r.success).toBe(false);
  });

  test("accepts EXTERNAL_URL", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "Ext", target: { type: "EXTERNAL_URL", url: "https://example.com" } },
    ]);
    expect(r.success).toBe(true);
  });

  test("rejects EXTERNAL_URL malformed", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "Ext", target: { type: "EXTERNAL_URL", url: "not-a-url" } },
    ]);
    expect(r.success).toBe(false);
  });

  test("accepts CONTENT with caches", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "Story", target: { type: "CONTENT", contentId: "ct1", contentTypeCache: "ARTICLE", contentSlugCache: "hello" } },
    ]);
    expect(r.success).toBe(true);
  });

  test("rejects unknown target.type (strict discriminated union)", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "X", target: { type: "BOGUS", url: "/x" } },
    ]);
    expect(r.success).toBe(false);
  });
});

describe("menuItemsSchema — depth & shape", () => {
  test("accepts 2-level nesting (top + children)", () => {
    const r = safeValidateMenuItems([
      {
        id: id("a"), label: "More",
        target: { type: "INTERNAL_URL", url: "/more" },
        children: [
          { id: id("b"), label: "AP", target: { type: "CATEGORY", categorySlug: "andhra-pradesh" } },
        ],
      },
    ]);
    expect(r.success).toBe(true);
  });

  test("rejects 3rd-level child (children of children not allowed)", () => {
    const r = safeValidateMenuItems([
      {
        id: id("a"), label: "More",
        target: { type: "INTERNAL_URL", url: "/more" },
        children: [
          {
            id: id("b"), label: "AP",
            target: { type: "CATEGORY", categorySlug: "andhra-pradesh" },
            // @ts-expect-error — child schema has no `children` field; this
            // is the whole point of the depth check.
            children: [{ id: id("c"), label: "Inner", target: { type: "INTERNAL_URL", url: "/x" } }],
          },
        ],
      },
    ]);
    expect(r.success).toBe(false);
  });

  test("rejects empty label", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "", target: { type: "INTERNAL_URL", url: "/x" } },
    ]);
    expect(r.success).toBe(false);
  });

  test("rejects label >80 chars", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "x".repeat(81), target: { type: "INTERNAL_URL", url: "/x" } },
    ]);
    expect(r.success).toBe(false);
  });

  test("rejects unknown key at top-level (strict)", () => {
    const r = safeValidateMenuItems([
      { id: id("a"), label: "X", target: { type: "INTERNAL_URL", url: "/x" }, extra: 1 },
    ]);
    expect(r.success).toBe(false);
  });
});

describe("resolveItemHref", () => {
  test("CATEGORY → /category/<slug>", () => {
    const t: MenuItemTarget = { type: "CATEGORY", categorySlug: "sports" };
    expect(resolveItemHref(t)).toBe("/category/sports");
  });
  test("INTERNAL_URL passes through", () => {
    expect(resolveItemHref({ type: "INTERNAL_URL", url: "/about" })).toBe("/about");
  });
  test("EXTERNAL_URL passes through", () => {
    expect(resolveItemHref({ type: "EXTERNAL_URL", url: "https://x.com" })).toBe("https://x.com");
  });
  test("CONTENT ARTICLE → /article/<slug>", () => {
    expect(resolveItemHref({ type: "CONTENT", contentId: "c1", contentTypeCache: "ARTICLE", contentSlugCache: "hello" })).toBe("/article/hello");
  });
  test("CONTENT VIDEO → /video/<slug>", () => {
    expect(resolveItemHref({ type: "CONTENT", contentId: "c1", contentTypeCache: "VIDEO", contentSlugCache: "v1" })).toBe("/video/v1");
  });
  test("CONTENT REEL → /reel/<slug>", () => {
    expect(resolveItemHref({ type: "CONTENT", contentId: "c1", contentTypeCache: "REEL", contentSlugCache: "r1" })).toBe("/reel/r1");
  });
  test("CONTENT WEB_STORY → /story/<slug>", () => {
    expect(resolveItemHref({ type: "CONTENT", contentId: "c1", contentTypeCache: "WEB_STORY", contentSlugCache: "s1" })).toBe("/story/s1");
  });
  test("CONTENT PHOTO_GALLERY → /gallery/<slug>", () => {
    expect(resolveItemHref({ type: "CONTENT", contentId: "c1", contentTypeCache: "PHOTO_GALLERY", contentSlugCache: "g1" })).toBe("/gallery/g1");
  });
  test("CONTENT CARTOON → /cartoon/<slug>", () => {
    expect(resolveItemHref({ type: "CONTENT", contentId: "c1", contentTypeCache: "CARTOON", contentSlugCache: "c1s" })).toBe("/cartoon/c1s");
  });
  test("CONTENT BREAKING_NEWS → null (no public detail page)", () => {
    expect(resolveItemHref({ type: "CONTENT", contentId: "c1", contentTypeCache: "BREAKING_NEWS", contentSlugCache: undefined })).toBe(null);
  });
  test("CONTENT missing slug → null", () => {
    expect(resolveItemHref({ type: "CONTENT", contentId: "c1", contentTypeCache: "ARTICLE" })).toBe(null);
  });
  test("CONTENT unknown cached type → null", () => {
    expect(resolveItemHref({ type: "CONTENT", contentId: "c1", contentTypeCache: "WAT", contentSlugCache: "x" })).toBe(null);
  });
});
