// Pure, dependency-free URL helpers for the Menu Builder.
//
// These live in their OWN module (not menu-tree-dnd.ts) because menu-tree-dnd
// imports @dnd-kit, which can't be pulled into a React Server Component - doing
// so breaks `next build` page-data collection. Here we only `import type` the
// Item shape (erased at compile time), so this file has zero runtime deps and
// is safe to import from BOTH the server page and the client editor.
import type { Item } from "./menu-tree-dnd";

// Strip a legacy `/category/<slug>` or `/district/<slug>` prefix off an internal
// URL so the menu stores the exact bare slug the public site serves (the SEO
// bare-slug migration). District-picker items are already bare; this also
// migrates older hand-typed `/district/<slug>` items the moment the menu is
// re-saved, so the admin display and the live links finally match.
export function normalizeMenuItemUrl(url: string): string {
  const m = url.match(/^\/(?:category|district)\/([^/?#]+)(.*)$/);
  return m ? `/${m[1]}${m[2]}` : url;
}

// Apply normalizeMenuItemUrl to every INTERNAL_URL item in the tree (top items
// + their children). Other target types pass through untouched.
export function normalizeMenuTreeUrls(items: Item[]): Item[] {
  const fix = (it: Item): Item =>
    it.target.type === "INTERNAL_URL"
      ? { ...it, target: { type: "INTERNAL_URL", url: normalizeMenuItemUrl(it.target.url) } }
      : it;
  return items.map((top) => {
    let out = fix(top);
    if (top.children?.length) out = { ...out, children: top.children.map(fix) };
    if (top.secondaryHeader?.items?.length) {
      out = { ...out, secondaryHeader: { ...top.secondaryHeader, items: top.secondaryHeader.items.map(fix) } };
    }
    return out;
  });
}

// Promote bare INTERNAL_URL items whose slug is a known district to the
// first-class DISTRICT target type, so legacy/hand-entered district links show
// up under the District picker (and resolve via the district resolver). Run
// AFTER normalizeMenuTreeUrls so any /district/<slug> prefix is already a bare
// /<slug>. Items that aren't districts (/horoscope, /about, …) pass through.
export function districtizeMenuTree(items: Item[], districtSlugs: Set<string>): Item[] {
  const fix = (it: Item): Item => {
    if (it.target.type === "INTERNAL_URL") {
      const m = it.target.url.match(/^\/([^/?#]+)$/);
      if (m && districtSlugs.has(m[1])) {
        return { ...it, target: { type: "DISTRICT", districtSlug: m[1] } };
      }
    }
    return it;
  };
  return items.map((top) => {
    const fixed = fix(top);
    return top.children?.length ? { ...fixed, children: top.children.map(fix) } : fixed;
  });
}

// Inverse of districtize: turn first-class DISTRICT items back into editable
// INTERNAL_URL links (/slug). Districts are URL-backed so the config panel can
// show the dynamic URL as an editable field (the District palette picker is
// just a shortcut that fills it). Run on load so any DISTRICT items saved by an
// earlier build become editable URLs again.
export function dedistrictizeMenuTree(items: Item[]): Item[] {
  const fix = (it: Item): Item =>
    it.target.type === "DISTRICT"
      ? { ...it, target: { type: "INTERNAL_URL", url: `/${it.target.districtSlug}` } }
      : it;
  return items.map((top) => {
    let out = fix(top);
    if (top.children?.length) out = { ...out, children: top.children.map(fix) };
    if (top.secondaryHeader?.items?.length) {
      out = { ...out, secondaryHeader: { ...top.secondaryHeader, items: top.secondaryHeader.items.map(fix) } };
    }
    return out;
  });
}
