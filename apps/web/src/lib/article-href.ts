// Single source of truth for article URL generation. Every internal link to an
// article must go through articleHref() so future URL pattern changes are a
// one-file edit. See docs/superpowers/specs/2026-05-26-seo-rayalaseema-design.md
// (Phase A0).

type ArticleLink = {
  // `id` is no longer used to build the URL (slugs are DB-unique, so no id
  // suffix). Kept optional for back-compat with callers that still pass it.
  id?: string;
  slug: string | null;
  // Primary category drives the canonical URL when the article isn't geo-tagged
  // → /telugu-news/<category>/<slug>. Optional because some link sources pass
  // a thin object; the /telugu-news route 301s any non-canonical path to the
  // real one, so a missing category just yields a self-healing fallback link.
  category?: { slug: string } | null;
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
 * Builds the canonical public URL for an article. Eenadu-style, all under the
 * /telugu-news/ prefix (so article URLs never collide with the bare-root
 * district/category hub routes):
 *
 * - Geo-tagged (has constituency): `/telugu-news/<district>/<constituency>/<slug>`
 * - Category (no constituency):    `/telugu-news/<category>/<slug>`
 * - Neither (rare):                `/telugu-news/<slug>`
 *
 * No id suffix - Content.slug is DB-unique, so the slug alone is the key.
 * If `slug` is missing (e.g. BREAKING_NEWS), returns `#`.
 */
export function articleHref(a: ArticleLink): string {
  if (!a.slug) return "#";
  const c = a.constituency;
  if (c?.slug && c.district?.slug) {
    // Eponymous district-HQ constituency (slug === district slug, e.g. Kurnool):
    // collapse to one segment so the URL isn't /telugu-news/kurnool/kurnool/...
    if (c.slug === c.district.slug) return `/telugu-news/${c.district.slug}/${a.slug}`;
    return `/telugu-news/${c.district.slug}/${c.slug}/${a.slug}`;
  }
  if (a.category?.slug) {
    return `/telugu-news/${a.category.slug}/${a.slug}`;
  }
  return `/telugu-news/${a.slug}`;
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
