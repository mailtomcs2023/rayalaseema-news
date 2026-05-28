// Body validation for taxonomy / config CRUD APIs:
//   /api/categories, /api/desks
// Menu builder has its own schemas in menu-schemas.ts which already validates
// what we need at the boundary.
//
// These schemas are shared between server (API route safeParse) AND client
// (form pre-submit safeParse). Keep them prisma-free so the client bundle
// stays tree-shake-friendly.
import { z } from "zod";

const NAME_MAX = 200;
const SLUG_MAX = 120;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
// Lowercase, digits, dashes only. Must start + end with [a-z0-9] (no leading
// or trailing dash). Matches the output of sanitizeSlug() in apps/admin/src/lib/slug.ts.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const cuid = z.string().trim().min(1).max(64);

// Reusable string field with friendly error messages - Zod v4 takes
// per-rule message strings inline.
function nameField(label: string) {
  return z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(NAME_MAX, `${label} must be at most ${NAME_MAX} characters`);
}

function slugField() {
  return z
    .string({ required_error: "Slug is required" })
    .trim()
    .min(1, "Slug is required")
    .max(SLUG_MAX, `Slug must be at most ${SLUG_MAX} characters`)
    .regex(SLUG_RE, "Slug must be lowercase letters, digits, and dashes only (no spaces or punctuation)");
}

// ---------- /api/categories ----------

const categoryCommon = {
  name: nameField("Name (Telugu)"),
  nameEn: nameField("Name (English)"),
  // Categories can auto-derive their slug server-side, so the client may
  // omit it entirely. When present, it has to look like a real slug.
  slug: slugField().optional().nullable(),
  color: z.string().regex(HEX_COLOR_RE, "Color must be a hex like #DC2626").optional().nullable(),
  description: z.string().trim().max(2000, "Description must be at most 2000 characters").optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
  parentId: cuid.optional().nullable(),
} as const;

export const categoryCreateSchema = z.object(categoryCommon).strict();
export const categoryUpdateSchema = z.object(categoryCommon).strict().partial();

// ---------- /api/desks ----------

const BRANCH_VALUES = ["TOPICAL", "GEOGRAPHIC", "EDITORIAL"] as const;

const deskCommon = {
  name: nameField("Name (Telugu)"),
  nameEn: nameField("Name (English)"),
  slug: slugField(),
  branch: z.enum(BRANCH_VALUES, { errorMap: () => ({ message: "Pick a valid branch" }) }),
  parentId: cuid.optional().nullable(),
  categoryId: cuid.optional().nullable(),
  districtId: cuid.optional().nullable(),
  constituencyId: cuid.optional().nullable(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  active: z.boolean().optional(),
} as const;

export const deskCreateSchema = z.object(deskCommon).strict();
export const deskUpdateSchema = z.object(deskCommon).strict().partial();

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type DeskCreateInput = z.infer<typeof deskCreateSchema>;
export type DeskUpdateInput = z.infer<typeof deskUpdateSchema>;
