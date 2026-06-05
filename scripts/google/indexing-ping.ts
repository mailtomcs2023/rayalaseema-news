#!/usr/bin/env bun
/**
 * Google Indexing API - ping all important URLs on the new domain so Google
 * picks them up faster than waiting on natural crawl.
 *
 * Note: Indexing API is officially supported for JobPosting + BroadcastEvent
 * structured data only; for general news content it often works in practice
 * but Google may rate-limit or deprioritize. We send it anyway because:
 *  - It's the fastest signal we can give Google about a brand-new domain.
 *  - Worst case: silently ignored (no penalty).
 *  - Quota is 200 requests/day per project.
 *
 * URLs prioritized:
 *   1. Homepage
 *   2. 8 district pages
 *   3. 55 constituency pages
 *   4. 246 mandal pages (district/constituency/mandal/slug)
 *   5. All PUBLISHED article URLs
 *
 * Run: bun scripts/google/indexing-ping.ts
 */

import { api } from "./auth";

const SITE = "https://rayalaseemanews.com";
const QUOTA = 200; // requests/day
const SCOPE = ["https://www.googleapis.com/auth/indexing"];

type UrlEntry = { url: string; priority: number };

async function fetchSitemap(): Promise<string[]> {
  const idx = await fetch(`${SITE}/sitemap-index.xml`).then((r) => r.text());
  const sitemaps = [...idx.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = new Set<string>();
  for (const sm of sitemaps) {
    try {
      const xml = await fetch(sm).then((r) => r.text());
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(m[1]);
    } catch {}
  }
  return [...urls];
}

async function notify(url: string, type: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED") {
  return api<any>("https://indexing.googleapis.com/v3/urlNotifications:publish", SCOPE, {
    method: "POST",
    body: JSON.stringify({ url, type }),
  });
}

async function main() {
  console.log("Discovering URLs via sitemap...");
  const all = await fetchSitemap();
  console.log(`  found ${all.length} URLs`);

  // Prioritize: homepage > district > constituency > mandal > article
  const score = (u: string) => {
    if (u === SITE || u === `${SITE}/`) return 100;
    if (/\/district\/[^/]+\/?$/.test(u)) return 90;
    if (/\/constituency\/[^/]+\/?$/.test(u)) return 80;
    if (/\/[^/]+\/[^/]+\/mandal\/[^/]+\/?$/.test(u)) return 70;
    if (/\/news\/[^/]+$/.test(u) || /\/[^/]+\/[^/]+\/[^/]+$/.test(u)) return 50;
    return 30;
  };

  const sorted = all
    .map((url) => ({ url, priority: score(url) }))
    .sort((a, b) => b.priority - a.priority);

  const toPing = sorted.slice(0, QUOTA);
  console.log(`Pinging top ${toPing.length} URLs (quota: ${QUOTA})\n`);

  let ok = 0,
    err = 0,
    quotaExceeded = false;
  for (let i = 0; i < toPing.length; i++) {
    const u = toPing[i];
    process.stdout.write(`[${i + 1}/${toPing.length}] (prio ${u.priority}) ${u.url.slice(0, 70).padEnd(70)} `);
    try {
      await notify(u.url, "URL_UPDATED");
      console.log("ok");
      ok++;
    } catch (e: any) {
      const msg = String(e.message || e).split("\n")[0];
      console.log(`err ${msg.slice(0, 60)}`);
      err++;
      if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
        console.log("\nQuota exceeded - stopping. Continue tomorrow.");
        quotaExceeded = true;
        break;
      }
    }
    // small pacing to avoid burst rate limit
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`\n✓ ok=${ok}  err=${err}${quotaExceeded ? "  (quota hit)" : ""}`);
  console.log(`  ${all.length - toPing.length} URLs not pinged (over quota - re-run tomorrow)`);
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
