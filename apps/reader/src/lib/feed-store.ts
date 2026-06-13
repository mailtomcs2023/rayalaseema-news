import type { Article } from "../api/client";

// Optional context that lets the swipe reader keep paginating on its own,
// exactly like the feed does. Omitted for finite sources (e.g. Saved), where
// the reader just swipes the handed-over list.
export interface ReaderPagination {
  category: string | null; // null = the mixed "all" feed
  offset: number; // next offset to request
  hasMore: boolean; // whether the server has more pages
}

interface ReaderFeed {
  articles: Article[];
  startIndex: number;
  pagination?: ReaderPagination;
}

// The full-screen swipe reader (app/reader.tsx) needs the same list of articles
// the user was just scrolling, plus where to start - and, for the feed/category
// sources, enough context to fetch more as the user swipes toward the end.
// Threading a large array through router params is fragile/slow, so we hand it
// off via this tiny module-level store. The feed sets it immediately before
// navigating; the reader reads it once on mount.
let pending: ReaderFeed | null = null;

export function setReaderFeed(
  articles: Article[],
  startIndex: number,
  pagination?: ReaderPagination,
) {
  pending = { articles, startIndex, pagination };
}

export function takeReaderFeed() {
  return pending;
}
