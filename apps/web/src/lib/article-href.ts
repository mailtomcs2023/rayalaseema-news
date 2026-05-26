// Single source of truth for article URL generation. Every internal link to an
// article must go through articleHref() so future URL pattern changes are a
// one-file edit. See docs/superpowers/specs/2026-05-26-seo-rayalaseema-design.md
// (Phase A0).

type ArticleLink = {
  id: string;
  slug: string | null;
  constituency?: {
    slug: string;
    district: { slug: string };
  } | null;
};

const RESERVED_DISTRICT_SLUGS = new Set<string>([
  "about", "api", "article", "author", "cartoon", "category", "cinema",
  "constituency", "contact", "district", "epaper", "gallery", "horoscope",
  "mandal", "masthead", "news", "news-sitemap.xml", "ownership", "page-builder",
  "privacy", "reel", "robots.txt", "rss", "search", "sitemap.xml",
  "sitemap-index.xml", "story", "tag", "terms", "video", "videos", "weather",
  "well-known", "ethics-policy", "corrections-policy", "editorial-standards",
  "diversity-policy", "mission", "feedback-policy",
]);

// Trailing chunk of a cuid is opaque-but-stable. 8 lowercase alphanumerics is
// enough distinctiveness to keep URLs unique even if slugs collide across
// constituencies. News-site URL convention (NYT etc) uses a similar id suffix.
function idSuffix(id: string): string {
  return id.slice(-8).toLowerCase();
}

/**
 * Builds the canonical public URL for an article.
 *
 * - Geo-tagged article (has constituency): `/[district]/[constituency]/<slug>-<id8>`
 * - Untagged article: `/news/<slug>-<id8>` — fallback that will shrink to near-zero
 *   once G2 (NER auto-tagging) lands and editors backfill the existing corpus.
 *
 * If `slug` is missing (e.g. BREAKING_NEWS with no public URL), returns `#` so
 * callers can render an inert link rather than crash. Callers should not link to
 * articles without slugs in the first place — guard upstream.
 *
 * Reserved-slug check: if a district happens to share a slug with a reserved
 * root (e.g. someone seeds `about` as a district), we fall through to /news/ to
 * avoid colliding with a static route. In practice the AP seed contains no such
 * collisions, but the guard is here for safety.
 */
export function articleHref(a: ArticleLink): string {
  if (!a.slug) return "#";
  const suffix = idSuffix(a.id);
  const c = a.constituency;
  if (c?.slug && c.district?.slug && !RESERVED_DISTRICT_SLUGS.has(c.district.slug)) {
    return `/${c.district.slug}/${c.slug}/${a.slug}-${suffix}`;
  }
  return `/news/${a.slug}-${suffix}`;
}

/**
 * Parses the `[slugid]` URL segment back into a `{ slug, suffix }` pair so a
 * page handler can fetch the underlying Content row by slug and verify the
 * suffix matches the row's id (defends against someone hand-crafting URLs that
 * point at the wrong article via slug collision).
 */
export function parseSlugId(slugid: string): { slug: string; suffix: string } | null {
  const m = slugid.match(/^(.+)-([a-z0-9]{8})$/);
  if (!m) return null;
  return { slug: m[1], suffix: m[2] };
}

/** True when the trailing suffix of `id` matches the `suffix` parsed from URL. */
export function suffixMatchesId(suffix: string, id: string): boolean {
  return idSuffix(id) === suffix;
}

export { RESERVED_DISTRICT_SLUGS };
