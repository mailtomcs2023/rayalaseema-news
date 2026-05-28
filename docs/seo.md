# SEO developer guide (Spec #4)

Operational reference for the SEO machinery shipped in Spec #4. Use this when you need to add a JSON-LD field, debug a missing IndexNow ping, populate a new analytics provider, or understand why a given article doesn't appear in GSC.

**Spec sources:** [design](./superpowers/specs/2026-05-26-seo-rayalaseema-design.md) · [research](./superpowers/specs/2026-05-26-seo-research.md) · [epic](https://github.com/mailtomcs2023/rayalaseema-express/issues/190)

## Architecture at a glance

```
Editor publishes article (admin)
        ↓
/api/content/[id] PUT  (apps/admin/src/app/api/content/[id]/route.ts)
        ├─► tagContentLocations()  → location-ner-hook.ts → @rayalaseema/nlp NER → ContentLocation rows
        ├─► injectInternalLinks()  → internal-linker.ts  → mutates body HTML w/ hub links
        ├─► pingIndexNow()         → indexnow.ts         → POSTs URL to api.indexnow.org
        └─► logAudit()             → audit row "content.publish"
        ↓
GET /[district]/[constituency]/<slug>-<id8>  (apps/web/src/app/[district]/[constituency]/[slugid]/page.tsx)
        ├─► getArticleBySlug() with constituency + author includes
        ├─► <ArticleView /> (apps/web/src/components/article-view.tsx)
        │       ├─► buildNewsArticleSchema  → @rayalaseema/seo-schema
        │       ├─► buildBreadcrumbListSchema
        │       └─► stringifyJsonLd → injects <script application/ld+json>
        ↓
GET /sitemap-index.xml → /sitemap.xml + /news-sitemap.xml + /rss/all.xml
        (all ISR-cached via export const revalidate = N)
        ↓
Crawlers (Googlebot, Bingbot) + AI engines (Perplexity, ChatGPT, Gemini)
robots.txt blocks GPTBot/ClaudeBot/CCBot/Perplexity/Google-Extended/Bytespider for training-only scrapes
```

## Shared packages

### `@rayalaseema/seo-schema`

JSON-LD generators consumed by both apps.

| Generator | Used in | What it emits |
|---|---|---|
| `buildNewsArticleSchema` | article page | NewsArticle w/ Person author, NewsMediaOrganization publisher, contentLocation+spatialCoverage, Speakable, keywords |
| `buildNewsMediaOrganizationSchema` | root layout | NewsMediaOrganization w/ sameAs, contactPoint, address, foundingDate, editorial-policy URLs, `disambiguatingDescription` (brand-vs-train) |
| `buildBreadcrumbListSchema` | article + 4 hub pages | BreadcrumbList w/ auto-numbered position |
| `buildPersonSchema` | /author/[slug] | Person w/ url=/author/<slug>, sameAs, knowsAbout, worksFor |
| `stringifyJsonLd` | every consumer | safe serializer - strips `undefined`, escapes `</script>` + U+2028/U+2029 |

**Tests:** `bun --filter=@rayalaseema/seo-schema test` - gated by `.github/workflows/schema-validate.yml` on every PR + push.

### `@rayalaseema/nlp`

Location NER for Telugu + English article bodies.

```ts
import { detectLocations } from "@rayalaseema/nlp";
const result = detectLocations({
  title, body,
  gazetteer: [/* LocationEntry[] from District/Constituency/Mandal */],
});
// → { primary: LocationMention | null, mentions: LocationMention[] }
```

Confidence rules:
- **HIGH** - match in title or first 100 chars of body
- **MEDIUM** - match in chars 100..600
- **LOW** - anywhere else

Primary picked by: highest confidence, then most-specific kind (Mandal > Constituency > District), then earliest offset.

## URL routing

| Pattern | Page | Notes |
|---|---|---|
| `/` | home (page builder template) | |
| `/[district]` | district hub (planned at /[district]; current /district/[slug] also valid) | sitemap emits both |
| `/[district]/[constituency]` | constituency hub (planned; current /constituency/[slug] also valid) | |
| `/[district]/[constituency]/[mandal]` | mandal hub | distinguished from article via `-<id8>` regex |
| `/[district]/[constituency]/[slugid]` | article (canonical) | slugid = `<slug>-<8-hex>` |
| `/news/[slugid]` | article fallback (no constituency tag) | shrinks toward 0 as G2 NER runs |
| `/author/[slug]` | author profile | keyed on User.publicProfileSlug |
| `/category/[slug]` · `/tag/[slug]` | topic hubs | template-rendered |
| `/masthead` etc | 12 trust pages | linked from footer |

`articleHref(article)` in `apps/web/src/lib/article-href.ts` is the single source of truth - every internal `<Link href="/article/...">` should call this.

## Sitemaps + indexing

- `/sitemap-index.xml` (D1) - submit this single URL to GSC + Bing; it references the rest.
- `/sitemap.xml` (D3) - every indexable URL (home, hubs, articles, trust pages); `revalidate=300`.
- `/news-sitemap.xml` (D2) - Google News spec; only articles published in last 48h; `revalidate=60`.
- `/rss/all.xml`, `/rss/district/<slug>.xml`, `/rss/category/<slug>.xml` (D6) - aggregator feeds.
- `/.well-known/<key>.txt` (D5) - IndexNow ownership; reads `SiteConfig.indexnow_key`.

**robots.txt** (D4): allows Googlebot/Bingbot/DuckDuckBot/YandexBot families; explicitly disallows GPTBot, ClaudeBot, CCBot, PerplexityBot, Google-Extended, Bytespider, Applebot-Extended, Meta-ExternalAgent, FacebookBot, Diffbot, Cohere-ai, YouBot.

## Analytics + monitoring

SiteConfig (key-value rows in `site_config`) drives every provider. Editor populates IDs via `/settings → SEO & Analytics`. Frontend code conditionally loads a script when the corresponding ID is non-empty:

| SiteConfig key | What gets loaded |
|---|---|
| `google_analytics_id` | GA4 gtag.js |
| `google_tag_manager_id` | GTM container |
| `google_adsense_id` | adsbygoogle.js |
| `bing_webmaster_id` | `<meta name="msvalidate.01">` |
| `clarity_project_id` | Microsoft Clarity tag |
| `indexnow_key` | served at `/.well-known/<key>.txt` |
| `sentry_dsn_web` · `sentry_dsn_admin` | env→Sentry init shim (optional dep) |
| `google_news_publisher_id` | reference for Publisher Center submission |

### Custom events

`apps/web/src/lib/ga4-events.ts` exposes a typed `track(name, params)`. Named events: `article_read`, `hub_view`, `search_query`, `scroll_depth_50`, `scroll_depth_100`, `web_vital`, `live_blog_view`, `gold_rate_view`, `mandi_view`.

### Daily SEO health check

`.github/workflows/seo-daily-check.yml` runs `packages/db/scripts/seo-daily-check.ts` every 03:00 IST. Outputs a JSON report + (if `SEO_HEALTH_WEBHOOK` secret is set) posts a Slack/Discord/email-relay digest. Captures: articles-last-24h, by-district, by-category, missing-location count, missing-image count, /news/ orphan fallback count, analytics-ID config state.

### Lighthouse CI

`.github/workflows/lighthouse-ci.yml` runs on push-to-main (post-deploy 240s sleep) + nightly cron + workflow_dispatch. Asserts performance ≥0.80, accessibility ≥0.85, best-practices ≥0.85, SEO ≥0.90 across home + district + constituency + article URLs. Hard thresholds: LCP ≤ 2500ms, INP ≤ 200ms, CLS ≤ 0.1.

### Pre-launch crawler audit

`packages/db/scripts/seo-launch-audit.ts` - walks sitemap.xml, fetches each URL, reports non-200s + missing meta + dup titles + redirect chains. Exits non-zero on critical findings.

```bash
BASE_URL=https://rayalaseemaexpress.com bun packages/db/scripts/seo-launch-audit.ts
```

### Internal SEO dashboard

`apps/admin/src/app/(dashboard)/seo/page.tsx` renders the same metrics the daily cron computes, plus an analytics-ID config table that flags unset providers and links to `/settings`.

## Debug runbook

### "This article isn't indexing in Google"

1. Check the article is in `/sitemap.xml`: `curl https://rayalaseemaexpress.com/sitemap.xml | grep <slug>`.
2. Check it's in `/news-sitemap.xml` if published < 48h ago: same grep against the news sitemap.
3. Verify `articleHref` produces the same URL Googlebot sees: open the article and check `<link rel="canonical">`.
4. GSC > URL inspection: paste the canonical URL; check coverage status. Common causes of non-index:
   - "Crawled - currently not indexed" - Google's discretion; usually clears in 1-3 weeks as the page accrues internal links.
   - "Discovered - currently not indexed" - Google hasn't crawled it. Check IndexNow ping was sent: search admin logs for `[indexnow]`.
   - "Soft 404" - the page rendered but Google decided it's thin. Check that the article has a full body + featured image + non-empty NewsArticle JSON-LD.
5. Check robots.txt: `curl https://rayalaseemaexpress.com/robots.txt` - the AI-bot disallows shouldn't apply, but verify Googlebot is in the allowlist.

### "Schema is broken"

1. Run the unit tests: `bun --filter=@rayalaseema/seo-schema test`.
2. Open the article and run Google's Rich Results Test: `https://search.google.com/test/rich-results?url=<canonical>`.
3. View source - copy the JSON inside `<script type="application/ld+json">`, paste into a JSON validator.
4. If the generator output is malformed, the schema-validate workflow would have failed on the PR - check the workflow run.

### "IndexNow isn't pinging"

1. Confirm `SiteConfig.indexnow_key` has a value: open `/settings → SEO & Analytics` in admin.
2. Verify the key file is reachable: `curl https://rayalaseemaexpress.com/.well-known/<key>.txt` should return the key as plain text.
3. Watch admin logs for `[indexnow]` lines on the next publish; non-200 from `api.indexnow.org` is logged as a warning (non-fatal).

### "I need to add a new JSON-LD field"

1. Add the field to the relevant builder in `packages/seo-schema/src/`.
2. Add an assertion in `__tests__/generators.test.ts`.
3. Run `bun --filter=@rayalaseema/seo-schema test`.
4. Consumer pages pick up the new field automatically through the generator return value.

### "Brand search returns the train, not us"

This is a known disambiguation problem - see `memory/project_brand_disambiguation.md`. Code-side mitigations are already shipped (NewsMediaOrganization.disambiguatingDescription + title pattern + alternateName). The long-game work is editorial: Wikipedia draft, Wikidata, PCI listing, news-directory backlinks with "news" anchor text.

## Where to look in the codebase

| Concern | Path |
|---|---|
| URL building | `apps/web/src/lib/article-href.ts` |
| Article rendering | `apps/web/src/components/article-view.tsx` |
| Article metadata | `apps/web/src/lib/article-metadata.ts` |
| DB query layer | `apps/web/src/lib/db-queries.ts` |
| JSON-LD generators | `packages/seo-schema/src/` |
| NER | `packages/nlp/src/location-ner.ts` |
| Publish hook | `apps/admin/src/app/api/content/[id]/route.ts` |
| IndexNow | `apps/admin/src/lib/indexnow.ts` + `apps/web/src/app/.well-known/[key]/route.ts` |
| Sitemaps | `apps/web/src/app/{sitemap-index,sitemap,news-sitemap}.xml/route.ts` |
| RSS feeds | `apps/web/src/app/rss/` |
| Robots | `apps/web/src/app/robots.ts` |
| Image pipeline | `apps/admin/src/lib/image-process.ts` |
| Daily health check | `packages/db/scripts/seo-daily-check.ts` |
| Launch audit | `packages/db/scripts/seo-launch-audit.ts` |
| Internal dashboard | `apps/admin/src/app/(dashboard)/seo/page.tsx` |
| OSM backfill | `packages/db/scripts/backfill-osm-coords.ts` |

## Memory notes (persistent context across sessions)

`~/.claude/projects/d--Rayalaseema-express/memory/` - Daisy's auto-memory store. Relevant files:
- `project_seo_credentials.md` - `rsepress2026@gmail.com` owns new accounts
- `project_seo_baseline.md` - GSC starting state
- `feedback_seo_strategy.md` - foundation-over-per-article + AMP-is-dead
- `project_brand_disambiguation.md` - train vs news brand

## What's NOT in Spec #4

- Sentry full Next.js wrap (instrumentation.ts + bundler config) - only the init shim ships
- GA4 + GSC OAuth integrations for the daily check (CWV p75 + top queries) - placeholder
- LiveBlogPosting admin UI for live-blog entry append - K5 ships schema only
- AMP - deleted in A0, will not return
- FAQPage schema - dead since May 2026 Google rich-results purge
- llms.txt - research says zero consumer

Open issues + roadmap: `gh issue list --milestone "Phase 5: Analytics, SEO & Ads"` or read the epic body at #190.
