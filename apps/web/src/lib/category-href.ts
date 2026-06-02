// Single source of truth for category hub URLs. Categories are served at the
// ROOT (Eenadu-style: /business, /sports) - no /category/ prefix. Old
// /category/<slug> URLs 301 to these via next.config.js redirects().
//
// Routing note: a category slug that collides with a bespoke top-level page
// (e.g. /weather, /devotional) is automatically served by that static page -
// Next.js gives static routes precedence over the dynamic root resolver.
// Keep every internal category link going through this helper so a future URL
// change stays a one-file edit (mirrors articleHref()).
export function categoryHref(slug: string): string {
  return `/${slug}`;
}

// Normalize a stored/legacy href: rewrite a `/category/<slug>` path to the bare
// `/<slug>`. Page-builder configs (SectionBand brandHref, tab hrefs) persist
// the old `/category/...` form in the DB; this keeps the *rendered* links clean
// without needing a data migration. Non-category hrefs pass through untouched.
export function normalizeCategoryHref(href: string): string {
  const m = href.match(/^\/category\/([^/?#]+)(.*)$/);
  return m ? `/${m[1]}${m[2]}` : href;
}
