import type { Article } from "../api/client";

// The full-screen swipe reader (app/reader.tsx) needs the same list of
// articles the user was just scrolling, plus where to start. Threading a large
// array through router params (URL-encoded JSON) is fragile and slow, so we
// hand it off via this tiny module-level store. The feed sets it immediately
// before navigating; the reader reads it on mount.
let pending: { articles: Article[]; startIndex: number } | null = null;

export function setReaderFeed(articles: Article[], startIndex: number) {
  pending = { articles, startIndex };
}

export function takeReaderFeed() {
  return pending;
}
