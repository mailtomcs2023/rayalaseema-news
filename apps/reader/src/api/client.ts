import Constants from "expo-constants";

// The reader app is a PUBLIC news consumer - it reads PUBLISHED content from
// the same endpoints the website (apps/web) serves. No auth, no tokens.

// In dev, ask Expo what host it loaded the bundle from - that's this PC, which
// is also running `next dev` for apps/web on port 3000. Self-heals across
// DHCP-IP changes without anyone editing .env.
function devApiUrl(): string | null {
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any).expoGoConfig?.developer?.tool ||
    (Constants as any).manifest2?.extra?.expoGo?.developer?.tool ||
    "";
  const host = hostUri.split(":")[0];
  return host ? `http://${host}:3000` : null;
}

// Priority: explicit override → dev auto-detect → production site.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? devApiUrl() : null) ||
  "https://rayalaseemanews.com";

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log("[reader] API_URL =", API_URL);
}

export interface Category {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  color: string | null;
}

export interface Article {
  id: string;
  title: string;
  slug: string | null;
  summary: string | null;
  featuredImage: string | null;
  publishedAt: string | null;
  viewCount: number;
  category: Category | null;
  author: { id: string; name: string } | null;
}

// Full article incl. the HTML body - returned by GET /api/articles/:id and
// rendered natively on the in-app article screen.
export interface ArticleFull extends Article {
  body: string | null;
}

interface ArticlesResponse {
  articles: Article[];
  total: number;
  limit: number;
  offset: number;
}

async function get<T>(path: string, timeoutMs = 12000): Promise<T> {
  // RN fetch has no default timeout - a dropped TCP connection (wrong IP,
  // firewall) hangs the UI for ~60s. Convert that into a real error.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`Request timed out (${API_URL}${path})`);
    }
    if (/network request failed/i.test(e?.message || "")) {
      throw new Error(`Network error reaching ${API_URL} - check the dev server is running`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const PAGE_SIZE = 20;

// One page of the public news feed, newest first. Pass a category slug to
// filter; omit it for the mixed "all news" feed.
export async function fetchArticles(opts: { category?: string; offset?: number } = {}) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(opts.offset ?? 0),
  });
  if (opts.category) params.set("category", opts.category);
  const data = await get<ArticlesResponse>(`/api/articles?${params.toString()}`);
  return {
    articles: data.articles,
    // The server returns `total`; derive whether another page exists so the
    // feed knows when to stop firing onEndReached.
    hasMore: (data.offset ?? 0) + data.articles.length < (data.total ?? 0),
  };
}

export async function fetchCategories() {
  return get<Category[]>(`/api/categories`);
}

// Full article (with HTML body) by id or slug, for the native article screen.
export async function fetchArticle(idOrSlug: string) {
  return get<ArticleFull>(`/api/articles/${encodeURIComponent(idOrSlug)}`);
}

export { PAGE_SIZE };
