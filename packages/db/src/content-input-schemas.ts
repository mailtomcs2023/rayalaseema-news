// Top-level Content create/update body validation. Per-type `payload`
// validation already lives in payload-schemas.ts; this file covers the
// fields that wrap around it (title, slug, status, etc).
//
// Both /api/content POST and PUT in apps/admin parse against these schemas.
// Mobile reporter clients and any future external integration should reuse
// them too - same source of truth.
import { z } from "zod";
import { ContentType } from "@prisma/client";

// Reasonable upper bounds - too generous and we let a runaway body through,
// too tight and we reject legitimate long-form articles. These are calibrated
// to Telugu newsroom output where a long article body can reach ~5000 chars,
// summaries cap around 300, titles 200.
const TITLE_MAX = 300;
const SUMMARY_MAX = 2000;
const BODY_MAX = 200_000; // HTML body of a long article
const SLUG_MAX = 120;
const URL_MAX = 2048;

// `cuid()` IDs are 25 chars, plenty under 64. Accept any non-empty short
// string so the schema isn't tightly coupled to the Prisma ID strategy.
const cuid = z.string().trim().min(1).max(64);

// Empty-string → null helper for nullable foreign keys. The admin UI sends
// "" for cleared <Select>s; we coerce so Prisma accepts it.
const emptyStringToNull = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().nullable(),
);

const STATUS_VALUES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED",
] as const;

const LANGUAGE_VALUES = ["TELUGU", "ENGLISH"] as const;

// Top-level Content fields shared by POST + PUT. `payload` is left untyped
// here (z.unknown) because per-type payload validation runs separately via
// safeValidatePayload(type, payload) - that schema needs the *resolved*
// ContentType to pick the right shape.
const contentCommonShape = {
  title: z.string().trim().min(1, "Title is required").max(TITLE_MAX),
  slug: z.string().trim().min(1).max(SLUG_MAX).optional().nullable(),
  summary: z.string().trim().max(SUMMARY_MAX).optional().nullable(),
  body: z.string().max(BODY_MAX).optional().nullable(),
  featuredImage: z.string().trim().max(URL_MAX).optional().nullable(),
  payload: z.unknown().optional().nullable(),
  categoryId: emptyStringToNull.optional(),
  constituencyId: emptyStringToNull.optional(),
  deskId: emptyStringToNull.optional(),
  status: z.enum(STATUS_VALUES).optional(),
  featured: z.boolean().optional(),
  language: z.enum(LANGUAGE_VALUES).optional(),
  sourceUrl: z.string().trim().max(URL_MAX).optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/).optional().nullable()),
  tagNames: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  needsPibApproval: z.boolean().optional(),
  // Multi-category cross-listing. Cap at 10 - anything more is editorial smell.
  additionalCategoryIds: z.array(cuid).max(10).optional(),
} as const;

// POST: type is required + must be a real ContentType.
export const contentCreateSchema = z.object({
  type: z.nativeEnum(ContentType),
  ...contentCommonShape,
}).strict();

// PUT: every field is optional (partial update), but the same constraints
// apply when present. type is NOT updatable.
export const contentUpdateSchema = z.object({
  ...contentCommonShape,
  // PUT-only: editor note attached to the revision snapshot.
  editNote: z.string().trim().max(500).optional().nullable(),
}).strict().partial();

export type ContentCreateInput = z.infer<typeof contentCreateSchema>;
export type ContentUpdateInput = z.infer<typeof contentUpdateSchema>;
