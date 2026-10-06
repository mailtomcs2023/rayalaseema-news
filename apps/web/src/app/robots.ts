// Spec #4 D4 (#217) - robots.txt with AI bot blocks.
//
// Allow Google + Bing + their image / news variants. Block the AI crawlers
// that scrape content for LLM training without sending traffic back -
// GPTBot (OpenAI), ClaudeBot (Anthropic), CCBot (Common Crawl), PerplexityBot,
// Google-Extended (Google AI training, separate from Search), Bytespider
// (ByteDance / TikTok), anthropic-ai (older Anthropic identifier).
//
// We intentionally allow the Search/citation-side bots from the same
// companies - we want our content cited in AI answers (with links back),
// just not free-mined for training.
//
// Reference: docs/superpowers/specs/2026-05-26-seo-research.md sec 4.
// 2026-08-11: unblocked OAI-SearchBot, ChatGPT-User, PerplexityBot and
// Claude-Web/ClaudeBot - those are citation/fetch bots that drive AI-search
// visibility, not training scrapers. The original list conflated the two
// (and wrongly assumed PerplexityBot wasn't the search indexer - it is;
// Perplexity-User is the on-demand fetcher).

import type { MetadataRoute } from "next";

const PUBLIC_DISALLOW = [
  "/api/",
  "/search",            // dynamic search pages - no SEO value
  "/admin/",
  "/_next/",
  "/*?preview=*",       // preview-mode URLs
  "/verify/",           // press-card QR verification pages - noindex, not a ranking surface
];

// Google-Extended is deliberately NOT in this list.
//
// It does not control Search indexing at all - Googlebot handles that, and
// Google-Extended only governs whether our content can be used in Gemini and
// grounding for AI Overviews / AI Mode. Blocking it therefore costs us
// eligibility for the AI answer surfaces where Telugu news queries
// increasingly get resolved, while buying no protection for ranking. For a
// site fighting to be seen at all, being quotable in an AI Overview is
// visibility we cannot afford to refuse.
//
// 2026-08-29 (owner decision): AI training crawlers UNBLOCKED. For a
// publication fighting for any visibility, content in training corpora means
// future models natively know the brand - worth more than the scraped-text
// protection. The former block list is kept here for a one-line revert once
// the site has standing to negotiate licensing instead:
// GPTBot, anthropic-ai, CCBot, Bytespider, Applebot-Extended,
// Meta-ExternalAgent, Meta-ExternalFetcher, FacebookBot, Diffbot,
// Omgilibot, Omgili, Cohere-ai, ImagesiftBot, YouBot
const AI_TRAINING_BOTS: string[] = [];

// AI search / citation bots: explicitly allowed. These index or fetch pages
// to answer user queries WITH source links - visibility we want. Kept as an
// explicit allow (not just wildcard fall-through) so the policy is legible
// in the generated robots.txt.
const AI_SEARCH_BOTS = [
  "OAI-SearchBot",   // ChatGPT Search index (not used for training)
  "ChatGPT-User",    // on-demand fetch when a ChatGPT user cites a page
  "PerplexityBot",   // Perplexity's search indexer - produces cited answers
  "Perplexity-User", // Perplexity's on-demand fetcher
  "ClaudeBot",       // Anthropic crawler honoring citation surfaces
  "Claude-Web",      // Claude's on-demand web fetch
];

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.SITE_URL || "https://rayalaseemanews.com";
  return {
    rules: [
      // Generic crawlers: allow with the usual exclusions.
      {
        userAgent: "*",
        allow: "/",
        disallow: PUBLIC_DISALLOW,
      },
      // Explicit allow for known-good search engines + their image variants.
      // Redundant with the wildcard rule above but makes the policy visible
      // to people reading the file.
      { userAgent: "Googlebot", allow: "/", disallow: PUBLIC_DISALLOW },
      { userAgent: "Googlebot-News", allow: "/", disallow: PUBLIC_DISALLOW },
      { userAgent: "Googlebot-Image", allow: "/", disallow: PUBLIC_DISALLOW },
      { userAgent: "AdsBot-Google", allow: "/", disallow: PUBLIC_DISALLOW },
      { userAgent: "Bingbot", allow: "/", disallow: PUBLIC_DISALLOW },
      { userAgent: "DuckDuckBot", allow: "/", disallow: PUBLIC_DISALLOW },
      { userAgent: "YandexBot", allow: "/", disallow: PUBLIC_DISALLOW },
      // AI search / citation bots: allowed with the standard exclusions.
      ...AI_SEARCH_BOTS.map((bot) => ({ userAgent: bot, allow: "/", disallow: PUBLIC_DISALLOW })),
      // AI training crawlers: blanket disallow. These don't drive traffic;
      // they ingest text for model training and send back no citation.
      ...AI_TRAINING_BOTS.map((bot) => ({ userAgent: bot, disallow: "/" })),
    ],
    // The index only. It references the section sitemap, every monthly article
    // shard, news, video and RSS - so listing children here as well would just
    // invite crawlers to fetch the same URLs by two routes and would keep the
    // retired flat /sitemap.xml alive as a discovery path.
    sitemap: [`${siteUrl}/sitemap-index.xml`],
    // No `host:` - it emitted a Yandex-only directive (deprecated since 2018)
    // that GSC flags as an unknown rule on every robots.txt variant.
  };
}
