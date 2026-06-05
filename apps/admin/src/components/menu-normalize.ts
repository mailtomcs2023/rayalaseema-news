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
    const fixed = fix(top);
    return top.children?.length ? { ...fixed, children: top.children.map(fix) } : fixed;
  });
}
