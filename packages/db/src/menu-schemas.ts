// Menu Builder Zod schemas (Spec #3 #176). Validates the 2-level item
// tree stored in Menu.items / Menu.draftItems. Used by /api/menu-builder
// handlers to reject bad shapes before they hit the DB.
import { z } from "zod";
import { MenuLocation, MenuItemTargetType } from "@prisma/client";

// Discriminated union on target.type so the per-variant fields stay strict
// (a CATEGORY target can't have an `url`, etc).
const targetSchema = z.discriminatedUnion("type", [
  // NONE = a label-only item: a dropdown/section parent that opens its children
  // but never navigates (header "మరిన్ని", footer column headings). Stored as
  // JSON so it doesn't need to be in the Prisma MenuItemTargetType enum, but we
  // keep that enum in sync for type-completeness.
  z.object({
    type: z.literal("NONE"),
  }).strict(),
  z.object({
    type: z.literal(MenuItemTargetType.CATEGORY),
    categorySlug: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal(MenuItemTargetType.INTERNAL_URL),
    url: z.string().regex(/^\/.*/, "Internal URL must start with /"),
  }).strict(),
  z.object({
    type: z.literal(MenuItemTargetType.EXTERNAL_URL),
    url: z.string().url(),
  }).strict(),
  z.object({
    type: z.literal(MenuItemTargetType.CONTENT),
    contentId: z.string().min(1),
    // Cached at save time so the public renderer doesn't pay a DB hit
    // per item just to derive /article/<slug> vs /video/<slug>.
    contentTypeCache: z.string().optional(),
    contentSlugCache: z.string().optional(),
  }).strict(),
]);

const mobileVariantSchema = z.enum(["show", "hide"]);

// Child items - no `children` field allowed (max depth 2).
const childItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  icon: z.string().nullable().optional(),
  target: targetSchema,
  mobileVariant: mobileVariantSchema.default("show"),
  openInNewTab: z.boolean().default(false),
}).strict();

// Top-level items can have up to ~10 children. Depth >2 (a child with its
// own children) is structurally impossible because childItemSchema doesn't
// have a `children` field.
const topItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  icon: z.string().nullable().optional(),
  target: targetSchema,
  mobileVariant: mobileVariantSchema.default("show"),
  openInNewTab: z.boolean().default(false),
  children: z.array(childItemSchema).max(40).default([]),
}).strict();

// Whole menu = array of top-level items. ~30 max for header (we warn at 10
// in the editor but allow up to 30 here so admins can stage future menus).
export const menuItemsSchema = z.array(topItemSchema).max(30);

export type MenuItem = z.infer<typeof topItemSchema>;
export type MenuItemTarget = z.infer<typeof targetSchema>;

export function validateMenuItems(items: unknown) {
  return menuItemsSchema.parse(items);
}

export function safeValidateMenuItems(items: unknown) {
  return menuItemsSchema.safeParse(items);
}

// Resolves a MenuItem.target to the public href that the renderer puts on
// the <a>. CATEGORY + EXTERNAL_URL + INTERNAL_URL are deterministic; CONTENT
// uses the cached type+slug fields populated when the item was saved.
const CONTENT_TYPE_PREFIX: Record<string, string> = {
  ARTICLE: "/article",
  VIDEO: "/video",
  REEL: "/reel",
  WEB_STORY: "/story",
  PHOTO_GALLERY: "/gallery",
  CARTOON: "/cartoon",
  // BREAKING_NEWS has no public detail page; resolver returns null so the
  // caller can render the label as a non-link.
};

export function resolveItemHref(target: MenuItemTarget): string | null {
  switch (target.type) {
    case "NONE":
      // Label-only parent (dropdown/section heading) - never a link.
      return null;
    case "CATEGORY":
      return `/category/${target.categorySlug}`;
    case "INTERNAL_URL":
      return target.url;
    case "EXTERNAL_URL":
      return target.url;
    case "CONTENT": {
      const prefix = target.contentTypeCache ? CONTENT_TYPE_PREFIX[target.contentTypeCache] : null;
      if (!prefix || !target.contentSlugCache) return null;
      return `${prefix}/${target.contentSlugCache}`;
    }
  }
}

// Lazy import of prisma to avoid pulling the client into apps/web edge bundles.
// getMenu is called from React Server Components - single Prisma query +
// projected to a plain MenuItem[]. Returns [] when the menu is unpublished
// or missing so headers render gracefully.
export async function getMenu(location: MenuLocation, prismaClient: any): Promise<MenuItem[]> {
  const menu = await prismaClient.menu.findUnique({ where: { location } });
  if (!menu || !menu.isPublished) return [];
  const parsed = menuItemsSchema.safeParse(menu.items);
  return parsed.success ? parsed.data : [];
}
