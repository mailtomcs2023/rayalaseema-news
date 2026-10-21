// DataForSEO REST client for keyword intelligence (spec 4.3a). Credentials
// are passed in by the caller; this module never reads files or env.
//
//   keywords_data/google_ads/search_volume/live      monthly volume + competition
//   dataforseo_labs/google/keyword_suggestions/live  long-tail containing the seed
//   dataforseo_labs/google/related_keywords/live     "searches related to"
//   serp/youtube/organic/live/advanced               who ranks on YouTube (no depth param)
//
// Location 2356 = India. Telugu-script keywords are passed as-is.

const BASE = "https://api.dataforseo.com/v3/";
export const INDIA = 2356;

export type KeywordRow = { term: string; volume: number | null; competition: string | null };
export type KeywordIdea = { term: string; volume: number | null };
export type YoutubeHit = { rank: number; channel: string; title: string; views: number | null; published: string | null; url: string };

export function createDataForSeo(o: { login: string; password: string; fetchImpl?: typeof fetch }) {
  const f = o.fetchImpl ?? fetch;
  const auth = "Basic " + Buffer.from(`${o.login}:${o.password}`).toString("base64");

  async function call<T = any>(path: string, task: Record<string, unknown>): Promise<T> {
    const res = await f(BASE + path, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify([task]),
      signal: AbortSignal.timeout(60_000),
    });
    const json: any = await res.json().catch(() => ({}));
    const t = json.tasks?.[0];
    if (!res.ok || json.status_code !== 20000 || !t || t.status_code !== 20000) {
      throw new Error(`${path}: ${json.status_message ?? res.status} ${t?.status_message ?? ""}`.trim());
    }
    return t.result as T;
  }

  const idea = (i: any): KeywordIdea => ({
    term: String(i.keyword_data?.keyword ?? i.keyword ?? ""),
    volume: i.keyword_data?.keyword_info?.search_volume ?? i.keyword_info?.search_volume ?? null,
  });

  return {
    async searchVolume(terms: string[], language = "en"): Promise<KeywordRow[]> {
      if (!terms.length) return [];
      const rows = await call<any[]>("keywords_data/google_ads/search_volume/live", {
        keywords: terms.slice(0, 1000),
        location_code: INDIA,
        language_code: language,
        search_partners: true,
      });
      return (rows ?? []).map((r) => ({ term: String(r.keyword), volume: r.search_volume ?? null, competition: r.competition ?? null }));
    },

    async suggestions(seed: string, limit = 25, language = "en"): Promise<KeywordIdea[]> {
      const res = await call<any[]>("dataforseo_labs/google/keyword_suggestions/live", {
        keyword: seed,
        location_code: INDIA,
        language_code: language,
        limit,
        include_seed_keyword: false,
        order_by: ["keyword_info.search_volume,desc"],
      });
      return (res?.[0]?.items ?? []).map(idea).filter((x: KeywordIdea) => x.term);
    },

    async related(seed: string, limit = 20, language = "en"): Promise<KeywordIdea[]> {
      const res = await call<any[]>("dataforseo_labs/google/related_keywords/live", {
        keyword: seed,
        location_code: INDIA,
        language_code: language,
        limit,
        depth: 1,
      });
      return (res?.[0]?.items ?? []).map(idea).filter((x: KeywordIdea) => x.term);
    },

    async youtubeSerp(keyword: string): Promise<YoutubeHit[]> {
      const res = await call<any[]>("serp/youtube/organic/live/advanced", {
        keyword,
        location_code: INDIA,
        language_code: "en",
        device: "mobile",
      });
      return (res?.[0]?.items ?? []).slice(0, 20).map((i: any, n: number) => ({
        rank: i.rank_absolute ?? n + 1,
        channel: String(i.channel_name ?? i.channel?.title ?? ""),
        title: String(i.title ?? ""),
        views: i.views_count ?? null,
        published: i.publication_date ?? null,
        url: String(i.url ?? ""),
      }));
    },
  };
}

export type DataForSeo = ReturnType<typeof createDataForSeo>;
