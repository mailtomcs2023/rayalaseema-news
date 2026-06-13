import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArticles, PAGE_SIZE, type Article } from "../api/client";

interface FeedState {
  articles: Article[];
  loading: boolean;        // first-page load (shows the centered spinner)
  refreshing: boolean;     // pull-to-refresh
  loadingMore: boolean;    // infinite-scroll footer
  error: string | null;
  hasMore: boolean;
}

// Owns the paginated news feed for one category (or the mixed feed when
// `category` is null). Handles first load, pull-to-refresh, and infinite
// scroll, guarding against overlapping requests + stale category responses.
export function useFeed(category: string | null) {
  const [state, setState] = useState<FeedState>({
    articles: [],
    loading: true,
    refreshing: false,
    loadingMore: false,
    error: null,
    hasMore: true,
  });

  // Bumped on every category change so a slow in-flight response for the old
  // category can't overwrite the new one.
  const reqId = useRef(0);

  const loadFirst = useCallback(
    async (isRefresh: boolean) => {
      const id = ++reqId.current;
      setState((s) => ({
        ...s,
        loading: !isRefresh,
        refreshing: isRefresh,
        error: null,
      }));
      try {
        const { articles, hasMore } = await fetchArticles({
          category: category ?? undefined,
          offset: 0,
        });
        if (id !== reqId.current) return;
        setState({
          articles,
          loading: false,
          refreshing: false,
          loadingMore: false,
          error: null,
          hasMore,
        });
      } catch (e: any) {
        if (id !== reqId.current) return;
        setState((s) => ({
          ...s,
          loading: false,
          refreshing: false,
          error: e?.message || "Error",
        }));
      }
    },
    [category],
  );

  const loadMore = useCallback(async () => {
    setState((s) => {
      if (s.loadingMore || s.loading || !s.hasMore) return s;
      return { ...s, loadingMore: true };
    });
    const id = reqId.current;
    try {
      // Read the current length at call time to compute the next offset.
      const offset = stateRef.current.articles.length;
      if (offset === 0 || !stateRef.current.hasMore) return;
      const { articles, hasMore } = await fetchArticles({
        category: category ?? undefined,
        offset,
      });
      if (id !== reqId.current) return;
      setState((s) => ({
        ...s,
        articles: dedupe([...s.articles, ...articles]),
        loadingMore: false,
        hasMore: hasMore && articles.length === PAGE_SIZE,
      }));
    } catch {
      if (id !== reqId.current) return;
      setState((s) => ({ ...s, loadingMore: false }));
    }
  }, [category]);

  // Keep a ref mirror so loadMore can read fresh length/hasMore without
  // re-creating the callback on every render.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    loadFirst(false);
  }, [loadFirst]);

  return {
    ...state,
    refresh: () => loadFirst(true),
    loadMore,
    retry: () => loadFirst(false),
  };
}

function dedupe(list: Article[]): Article[] {
  const seen = new Set<string>();
  return list.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}
