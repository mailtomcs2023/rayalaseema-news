// Centralized slug helpers — every article slug in the system MUST go through these.
// Prevents URL-breaking characters (slashes, spaces, unicode, punctuation) from reaching the DB.

const MAX_SLUG_LEN = 120;

/** Strip everything except [a-z0-9-]. Collapse repeated dashes. Trim leading/trailing dashes. */
export function sanitizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, MAX_SLUG_LEN);
}

/**
 * Build a fresh slug from a title.
 * Strategy:
 *  1. Try to extract the ASCII (English) portion of the title — yields readable slugs for translated content.
 *  2. If no ASCII content (pure Telugu title), fall back to a timestamp-based slug.
 *  3. Sanitize the result.
 */
export function buildSlugFromTitle(title: string, fallbackPrefix = "news"): string {
  const ascii = title.replace(/[^\x00-\x7F]/g, " ").trim();
  const base = ascii.length >= 3 ? ascii : `${fallbackPrefix}-${Date.now()}`;
  const clean = sanitizeSlug(base);
  return clean || `${fallbackPrefix}-${Date.now()}`;
}

/**
 * Ensure uniqueness against a pre-fetched set of existing slugs. Appends -1, -2, ... until unique.
 * Caller is responsible for adding the returned slug to the set if they keep using it.
 */
export function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 1;
  let candidate: string;
  do {
    candidate = sanitizeSlug(`${base}-${i++}`);
  } while (existing.has(candidate));
  return candidate;
}
