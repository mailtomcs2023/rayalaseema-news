// Per-ContentType payload schemas. Validates the JSON blob stored in
// Content.payload. See docs/superpowers/specs/2026-05-25-unified-content-model-design.md.
//
// Used by /api/content POST + PUT handlers in apps/admin to reject malformed
// payloads at the HTTP boundary. Frontend renderers can also import these
// schemas for client-side form validation if they want, but the source of
// truth is server-side.
import { z } from "zod";
import { ContentType } from "@prisma/client";

// ---------- Type-specific schemas ----------

// ARTICLE - common case: long-form text with optional movie-review fields.
// sourceUrl is promoted to a top-level Content column, not in payload.
export const articlePayloadSchema = z.object({
  rating: z.number().min(0).max(5).optional(),
  reviewerName: z.string().trim().min(1).max(100).optional(),
  // Optional featured VIDEO (YouTube/hosted/Blob URL). When set, the public
  // article hero plays this instead of showing featuredImage - the editor
  // enforces image-OR-video (never both), so this is a true alternative hero.
  featuredVideo: z.string().trim().max(2048).optional(),
}).strict();

// VIDEO - YouTube / hosted player. Duration in seconds.
export const videoPayloadSchema = z.object({
  videoUrl: z.string().url(),
  duration: z.number().int().nonnegative(),
  thumbnailUrl: z.string().url().optional(),
}).strict();

// REEL - short vertical clip, similar shape to VIDEO but the URL is typically
// hosted on Azure Blob (no YouTube embeds).
export const reelPayloadSchema = z.object({
  clipUrl: z.string().url(),
  duration: z.number().int().nonnegative(),
}).strict();

// WEB_STORY - swipeable cards. At least one slide required.
export const webStoryPayloadSchema = z.object({
  slides: z.array(
    z.object({
      image: z.string().url(),
      caption: z.string().max(500).optional(),
    }).strict(),
  ).min(1).max(20),
}).strict();

// PHOTO_GALLERY - multi-photo collection. At least one photo required.
export const photoGalleryPayloadSchema = z.object({
  photos: z.array(
    z.object({
      url: z.string().url(),
      caption: z.string().max(500).optional(),
    }).strict(),
  ).min(1).max(100),
}).strict();

// CARTOON - single image with optional caption + publish date (ISO).
export const cartoonPayloadSchema = z.object({
  caption: z.string().max(500).optional(),
  date: z.string().datetime(),
}).strict();

// BREAKING_NEWS - ticker headline. No body, no slug, no image. Priority
// drives sort order in the ticker; expiresAt is optional auto-hide time.
export const breakingNewsPayloadSchema = z.object({
  priority: z.number().int().min(1).max(10),
  expiresAt: z.string().datetime().optional(),
  // Optional link to the full story (internal path like "/kurnool/..." or an
  // absolute URL). When set, the /breaking page makes the headline clickable.
  // Empty/absent => headline-only alert.
  url: z.string().optional(),
}).strict();

// ---------- Registry + helpers ----------

// Discriminated map: ContentType -> Zod schema for that type's payload.
// Adding a new ContentType in the future means adding both an enum value
// (schema.prisma) and a schema entry here.
export const PAYLOAD_SCHEMAS = {
  [ContentType.ARTICLE]: articlePayloadSchema,
  [ContentType.VIDEO]: videoPayloadSchema,
  [ContentType.REEL]: reelPayloadSchema,
  [ContentType.WEB_STORY]: webStoryPayloadSchema,
  [ContentType.PHOTO_GALLERY]: photoGalleryPayloadSchema,
  [ContentType.CARTOON]: cartoonPayloadSchema,
  [ContentType.BREAKING_NEWS]: breakingNewsPayloadSchema,
} as const;

// Compile-time check that every ContentType has a schema. If a new enum value
// is added without a schema, TypeScript fails here.
type _Exhaustive = {
  [K in ContentType]: (typeof PAYLOAD_SCHEMAS)[K];
};

// Type helper: PayloadFor<"ARTICLE"> = { rating?: number; reviewerName?: string }
export type PayloadFor<T extends ContentType> = z.infer<(typeof PAYLOAD_SCHEMAS)[T]>;

// Runtime validator. Returns parsed payload or throws ZodError.
// Callers should catch and translate to HTTP 400 (see apps/admin/src/lib/api-utils.ts).
export function validatePayload<T extends ContentType>(
  type: T,
  payload: unknown,
): PayloadFor<T> {
  const schema = PAYLOAD_SCHEMAS[type];
  if (!schema) {
    throw new Error(`No payload schema registered for ContentType: ${type}`);
  }
  return schema.parse(payload) as PayloadFor<T>;
}

// Safe variant - returns { success, data | error } instead of throwing.
// Useful when you want to render field-level errors back to the client.
export function safeValidatePayload<T extends ContentType>(
  type: T,
  payload: unknown,
) {
  return PAYLOAD_SCHEMAS[type].safeParse(payload);
}
