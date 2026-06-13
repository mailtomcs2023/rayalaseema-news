import { API_URL, type Article } from "../api/client";

// Public canonical path for an article on the website. Mirrors
// apps/web/src/lib/article-href.ts (the /telugu-news route 301s any
// non-canonical path to the real one, so the category/slug form is always safe
// even without constituency data, which the public API doesn't return).
export function articlePath(a: Article): string | null {
  if (!a.slug) return null;
  if (a.category?.slug) return `/telugu-news/${a.category.slug}/${a.slug}`;
  return `/telugu-news/${a.slug}`;
}

// Absolute URL for opening "Read full story" in the browser / sharing.
export function articleUrl(a: Article): string | null {
  const path = articlePath(a);
  return path ? `${API_URL}${path}` : null;
}
