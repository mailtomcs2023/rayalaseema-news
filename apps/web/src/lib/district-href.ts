// Single source of truth for district hub URLs. Districts are served at the
// ROOT bare slug (Eenadu-style: /kurnool, /tirupati) - no /district/ prefix.
// Old /district/<slug> URLs 301 to these via next.config.js redirects().
// Mirrors categoryHref(); keep every internal district link going through this.
export function districtHref(slug: string): string {
  return `/${slug}`;
}
