// Spec #4 D5 (#218) - IndexNow ping helper.
//
// POSTs a batch of URLs to https://api.indexnow.org/IndexNow so Bing /
// Yandex / Naver / Seznam (and Perplexity's index, which routes through
// Bing) pick them up within minutes instead of waiting for a crawl pass.
// Google does not support IndexNow yet (still "testing" since Oct 2021).
//
// Idempotent: safe to call on every publish / unpublish / edit. Calls are
// fire-and-forget - IndexNow API returns 200 quickly and any errors are
// logged but don't block the user's publish action.

import { prisma } from "@rayalaseema/db";

const ENDPOINT = "https://api.indexnow.org/IndexNow";

let cachedKey: string | null = null;
let cachedKeyExpires = 0;
async function getKey(): Promise<string | null> {
  const now = Date.now();
  if (cachedKey !== null && cachedKeyExpires > now) return cachedKey;
  const row = await prisma.siteConfig.findUnique({ where: { key: "indexnow_key" } });
  cachedKey = row?.value?.trim() || null;
  cachedKeyExpires = now + 5 * 60 * 1000; // 5-min cache
  return cachedKey;
}

/**
 * Pings IndexNow with a list of absolute URLs. Empty list / missing key /
 * network failure all degrade silently - never throws.
 *
 * Call from publish / unpublish / restore actions. Batch up to 10000 URLs
 * per request per the IndexNow spec.
 */
export async function pingIndexNow(urls: string[]): Promise<void> {
  if (!urls.length) return;
  const key = await getKey();
  if (!key) {
    console.warn("[indexnow] key not configured in SiteConfig - skipping ping");
    return;
  }
  const host = (process.env.SITE_URL || "https://rayalaseemanews.com")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const body = {
    host,
    key,
    keyLocation: `https://${host}/.well-known/${key}.txt`,
    urlList: urls.slice(0, 10000),
  };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`[indexnow] ${res.status} for ${urls.length} URLs: ${txt.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn("[indexnow] network error (non-fatal):", (err as Error).message);
  }
}
