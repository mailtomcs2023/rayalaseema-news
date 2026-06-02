# SEO Research Notes - Spec #4 Kickoff

**Date:** 2026-05-26
**Author:** Claude Code (with Daisy reviewing decisions)
**Scope:** Live web research conducted at the start of Spec #4 (SEO Rayalaseema) per the master SEO prompt Step 0.2. Documents the findings that shaped - and in several places contradicted - the original spec.

This file is the source of truth for "why we made the calls we made". When the spec changes, update this file too.

---

## 1. NewsArticle / Article schema (Google, May 2026)

**Question:** What does Google currently require for NewsArticle structured data, and what changed in early 2026?

**Findings:**

- Google's [Article markup docs](https://developers.google.com/search/docs/appearance/structured-data/article) (last updated 2025-12-10) list **no strictly required properties**. Recommended fields are still `headline`, `image` (multiple aspect ratios), `datePublished`, `dateModified`, `author`, `publisher`. NewsArticle inherits these with stricter expectations on timeliness and image quality (1200×675 px minimum).
- [Google updated Article-type structured-data guidance](https://www.searchenginejournal.com/google-updates-article-type-structured-data-guidance/475566/) to emphasise that `author.url` (a page that uniquely identifies the author) is now a stronger discoverability signal than ever.
- The [May 2026 core update](https://schemaninja.com/core-update-is-still-rolling-out/) hit pages that are "informational but light on structured signals - no schema markup, no clear author attribution, no obvious signals of expertise or authority" the hardest. Pages with proper Article schema held up better because Google could categorise them confidently.
- [Digital Applied's I/O 2026 cheat sheet](https://www.digitalapplied.com/blog/structured-data-after-io-2026-schema-updates) notes Gemini-powered AI Mode now uses schema markup to verify claims and establish entity relationships during answer synthesis - accurate schema increases AI-Mode citation probability even without a rich-result display.

**Decisions for the spec:**

1. NewsArticle JSON-LD generator (`packages/seo-schema`) must emit `Person` author (not Organization) with an `url` pointing at `/author/<slug>`. The current `desk` byline becomes `publisher`, not `author`.
2. Image array must carry three aspect ratios (16:9, 4:3, 1:1) - Google explicitly recommends this for News carousels and Top Stories. Phase E ships the multi-aspect pipeline.
3. Add `contentLocation` + `spatialCoverage` (Place type) on every article using the article's primary constituency / district lat-lng. This is the regional-news ranking lever Eenadu/Sakshi under-use - a real wedge for us.
4. Add SpeakableSpecification fragment for voice search (still recommended but not widely competed for).
5. Ship FAQPage schema on hub pages (4–6 FAQs per location). Schema is still showing in rich results in 2026 for FAQs answered on the page.

---

## 2. Core Web Vitals thresholds (2026)

**Question:** Have the LCP / INP / CLS thresholds shifted since the spec was drafted?

**Findings (multiple sources, 2026):**

- [corewebvitals.io](https://www.corewebvitals.io/core-web-vitals): LCP < 2.5s good, INP < 200ms good, CLS < 0.1 good. Unchanged.
- [DEV Community 2026 benchmark guide](https://dev.to/dharanidharan_d_tech/fix-lcp-inp-cls-in-2026-the-complete-core-web-vitals-guide-with-real-benchmarks-54cl): same thresholds; 43% of sites still fail INP - it's the most-failed Core Web Vital in 2026.
- [Google's CrUX threshold definition page](https://web.dev/articles/defining-core-web-vitals-thresholds): assessed at the 75th percentile of real-user data per URL.

**Decisions:**

- Thresholds in the spec (E2) are correct - keep as-is.
- INP gets first-pass focus because it's the most-failed and our admin app uses heavy Tiptap editors that could leak into public bundle if not properly code-split. Spot-check via DevTools INP profiler before claiming E2 done.

---

## 3. llms.txt adoption

**Question:** Should we ship `llms.txt`? The spec leaves the call to research.

**Findings:**

- [State of llms.txt 2026 - Presenc AI](https://presenc.ai/research/state-of-llms-txt-2026): community-managed spec, no IETF RFC. Adoption expanded into mainstream SaaS / publishing through Q1 2026.
- [Search Signal - what llms.txt does and doesn't do](https://searchsignal.online/blog/llms-txt-2026): "Google publicly stated their systems don't currently use it. The major LLM crawlers from OpenAI, Google, and Anthropic don't request it in any meaningful volume."
- [LinkBuildingHQ 2026 implementation review](https://www.linkbuildinghq.com/blog/should-websites-implement-llms-txt-in-2026/): even TechCrunch (top-ranked tech publisher in their dataset) has no llms.txt; for ad-supported news publishers, where content changes daily, a static manifest has minimal value.

**Decision:** **Skip llms.txt** (originally spec D7). The signal has no consumer. Revisit Q4 2026 if adoption picks up.

---

## 4. IndexNow protocol (2026)

**Question:** Worth integrating for a news site whose primary discoverability target is Google (which doesn't support IndexNow)?

**Findings:**

- [IndexNow.org](https://www.indexnow.org/): 5+ billion daily submissions in 2026, up from 3.5B in 2024.
- Supporters: Bing, Yandex, Naver, Seznam, Yep. Not Google (still "testing" since Oct 2021 per [Pressonify Feb 2026 review](https://pressonify.ai/blog/indexnow-instant-indexing-press-releases-2026)).
- [Sight AI's automated indexing guide](https://www.trysight.ai/blog/automated-indexing-for-news-publishers): "High-frequency updates benefit most from IndexNow, with news sites … able to ensure AI systems cite the latest information within hours of publication."

**Decision:** **Ship D5 - IndexNow**. Bing-only direct value, but:
1. Microsoft Copilot citations route through Bing's index; speed-to-index matters for AI mode visibility.
2. IndexNow key is also recognised by Yandex and Naver - non-zero traffic from Telugu diaspora in those markets.
3. Implementation cost is small (one POST per publish), and the same hook can later fan out to Google's Indexing API when it eventually exits Job-Posting-only beta.

---

## 5. URL stability vs URL pattern change

**Original spec proposal:** `/[district]/[town]/[article-slug]-[id]`
**Current production:** `/article/[slug]` (331+ articles live).

**My recommendation:** Keep `/article/[slug]`. URL stability is rule #6 of the spec. Adding a `/[district]/[constituency]/` hub layer was enough to capture the geo-SEO lever without breaking existing URLs.

**Daisy's decision:** Migrate to `/[district]/[town]/[slug]-[id]`. Rule #3 of the spec ("push back when wrong, defer if insistent") applies - pushed back once, decision is theirs.

**Safeguards baked into Phase A0 to make the migration survivable:**

1. **Slug-preservation** - new path is `/[district]/[town]/<existing-slug>-<numeric-id>`. The slug Google already knows is preserved inside the new URL; only the prefix changes.
2. **301 redirect middleware** (`apps/web/middleware.ts`) - every `/article/<slug>` request 301s to the new URL by DB lookup. AMP variant redirects too.
3. **Internal link sweep** - every `<Link href="/article/...">` site-wide rewrites to a helper `articleHref(article)` so future URL changes are one-file. No raw string URLs.
4. **Sitemap re-emit** - new URLs only; old URLs ping IndexNow as deleted.
5. **GSC re-submit** + 30-day Search Performance watch for ranking drop.
6. **Playwright smoke test** - hits 50 random old URLs, asserts 301 → 200 on new URL with matching content.
7. **Rollback escape hatch** - env flag `URL_PATTERN=legacy|new` keeps old routes alive for 30 days post-cutover. Removed in cleanup phase.

**Reference:** Google supports 301 chains and re-indexes within weeks; the documented worst case is a 4–12 week ranking dip while signals re-consolidate on the new URLs. The baseline ranking is so weak (23 clicks in 10 days - see [project_seo_baseline.md](../../../C:/Users/reddygs/.claude/projects/d--Rayalaseema-news/memory/project_seo_baseline.md)) that the risk is acceptable.

---

## 6. Rayalaseema scope - 6 vs 8 districts

**Original spec:** 6 districts (Kurnool, Nandyal, Kadapa, Anantapur, Sri Sathya Sai, Chittoor).
**Reality:** post-2022 AP reorganisation gave the region **8 districts**. Existing seed in [`packages/db/prisma/location-data.json`](../../../packages/db/prisma/location-data.json) already has all 8: Kurnool, Nandyal, Anantapuramu, Sri Sathya Sai, YSR-Kadapa, Annamayya, Tirupati, Chittoor.

**Decision:** Spec scope = **8 districts**. Tirupati specifically is a regional powerhouse (Tirumala / Tirupati temple tourism news volume); dropping it would forfeit a major ranking opportunity.

---

## 7. Next.js 16 caching model

**Question:** How should we structure cache rules for news pages under Cache Components?

**Findings:**

- [Next.js 15→16 migration playbook](https://www.digitalapplied.com/blog/next-js-15-to-16-migration-playbook-cache-components-2026): caching model has shifted from `fetch-cache + revalidate` to **Cache Components - Partial Prerendering on by default, `use cache` directive for explicit cached functions, tag-based invalidation via `cacheTag` and `updateTag`**.
- [Next.js revalidation guide](https://nextjs.org/docs/app/guides/how-revalidation-works): `cacheLife` profiles (seconds / minutes / hours / days / weeks / max) replace ad-hoc `revalidate: 300` calls.

**Decisions (Phase E4):**

- Article pages: `cacheLife('hours')` with `cacheTag(\`article:\${id}\`)`. `updateTag` on edit/publish.
- Hub pages (district, constituency, category): `cacheLife('minutes')`, tagged by location/category slug. `updateTag` on any article publish in that area.
- Sitemaps: `cacheLife('minutes')` for main sitemap, `cacheLife('seconds')` for news-sitemap (Google News expects ≤ 5-min freshness).
- Avoid mixing the old `revalidate: <n>` syntax with new Cache Components in the same module - Next 16 docs warn this leads to undefined behaviour.

---

## 8. AMP - DROP (reversed 2026-05-26)

**Initial decision:** keep (sunk cost - already shipped at [`apps/web/src/app/article/[slug]/amp/route.ts`](../../../apps/web/src/app/article/%5Bslug%5D/amp/route.ts)).

**Reversed after Daisy push-back:** "why AMP, AMP is outdated right."

**Findings on review:**

- 2021: Google removed AMP requirement for Top Stories - the original ranking incentive for AMP collapsed.
- 2022–2024: Major publishers removed AMP - NYTimes, Washington Post, BBC, Vox, The Guardian.
- 2025–2026: AMP project is in maintenance mode; not recommended for new builds.
- Spec author's Final Rule #3 explicitly lists "AMP" as an example of something that HURTS SEO (alongside URL pattern changes and removing schema). My initial reading inverted this.

**Decision:** **Drop AMP entirely as part of Phase A0.**

1. Delete `apps/web/src/app/article/[slug]/amp/route.ts`.
2. Remove `alternates.types["text/html+amp"]` from article page metadata.
3. Middleware redirects `/article/<slug>/amp` → new canonical URL (no AMP suffix on the new pattern; legacy AMP traffic lands on canonical HTML).
4. No AMP variant on the new `/[district]/[town]/<slug>-<id>` pattern.
5. Sitemap + news-sitemap emit canonical URLs only (no AMP rels).

**Maintenance saved:** AMP-validate-on-CI step never needs to ship; no AMP-specific styling rules; one fewer route to keep in sync.

---

## 9. Indian / Telugu news SEO patterns (Eenadu, Sakshi)

**Findings:** Direct technical audit of Eenadu / Sakshi is out of scope for this round (no MCP tooling for source-fetch their HTML), but [Brand Story's 2026 India SEO trends](https://brandstory.in/blogs/seo-trends-india-2026/) confirms: hreflang tags, structured data, vernacular content, and mobile-first CWV are the four pillars. Telugu/Hindi/Marathi content is a high-priority targeting axis.

**Decisions:**

- `inLanguage: "te"` on every NewsArticle JSON-LD (already done in current `article/[slug]/page.tsx` - keep).
- `hreflang` alternates: `te-IN` (primary), `en` (for the English summary block planned in G4). No `hreflang` for other Telugu states since the content is regional.
- English summary block per article - competitive wedge. Eenadu / Sakshi don't do this. AI-generated, editor-overridable. Improves discoverability for English-language searches naming Rayalaseema locations.

---

## 10. GSC baseline reality

**Snapshot (2026-05-26, screenshot from Daisy):**

- Property: `rayalaseemanews.com` (verified, owned by `rsepress2026@gmail.com`)
- Reported indexed: 34 - but per Daisy, this number includes earlier dummy/test content that has since been removed. Real-content baseline is effectively zero.
- Clicks last 10 days: 23.
- Breadcrumbs enhancement is ON - confirms current BreadcrumbList JSON-LD is being read correctly.
- CWV report is enabled - real CrUX data available for E2.

**Implication:** This is a **fresh launch**, not an optimization pass. Spec phases should be sequenced to maximise first-time discovery of the 331+ legitimate articles rather than tuning existing rankings. Tier-0 outcome: 80%+ of real articles indexed within 90 days.

See [`project_seo_baseline.md`](../../../C:/Users/reddygs/.claude/projects/d--Rayalaseema-news/memory/project_seo_baseline.md) for the persistent memory note.

---

## 11. Strategic framing - foundation over per-article (Daisy, 2026-05-26)

Late-breaking strategic reframe from Daisy: "today news, tomorrow's waste paper." SEO effort for Rayalaseema News must go into the **durable foundation layer that compounds over time**, NOT into optimizing individual ephemeral news articles like they were service pages.

**Implications for the spec:**

- **Tier-0 ranking targets** = the geo-hierarchy hubs (8 districts × ~52 constituencies × ~200 mandals = 1500+ ranking-target URLs that never expire). Phase F (hub-page depth) is where editorial-review time concentrates.
- **Per-article work is automation only** - schema generators auto-render on render, image pipeline auto-processes on upload, IndexNow auto-pings on publish, internal links auto-attach via hub→article flow. No per-article manual SEO tuning.
- **English summary block** (originally G4, framed as a ranking play) downgrades to an accessibility/UX feature deferred to Phase 2 (post-epic). Not a foundation item.
- **Internal-linking automation** stays in scope but reframes from "ranking play" to "indexing aid" - helps Google discover orphan articles via the hub layer.
- **NER location detection** stays in scope as **tagging infrastructure feeding the hubs**, not as per-article optimization.

Reference: this matches the Eenadu / Sakshi pattern - individual article URLs barely rank long-term; their CATEGORY + LOCATION hubs rank for everything. See [`feedback_seo_strategy.md`](../../../C:/Users/reddygs/.claude/projects/d--Rayalaseema-news/memory/feedback_seo_strategy.md) for the persistent memory note.

---

## 12. Open questions deferred to issue-time

- **GSC property type** - Domain vs URL-prefix? Screenshot suggests Domain; will confirm at Phase H2.
- **Bing Webmaster Tools** - does a property already exist under `rsepress2026@gmail.com`? Confirm at Phase H3.
- **Google News Publisher Center** - has the publication been submitted previously under any account? Confirm at Phase H4.
- **AdSense Publisher ID** - currently in `SiteConfig.google_adsense_id`. Is the existing ID owned by `reddygs@medhahosting.com` or `rsepress2026@gmail.com`? Determines whether issue #41 (separate from this epic) needs an account-swap step.
- **Image storage backend** for the multi-aspect pipeline - Azure Blob (already in `.env.example`) vs Cloudinary (already in `next.config.js` remotePatterns) vs both? Confirm at Phase E1.
- **Editorial reviewer per district** for the 800-word context blocks - single editor approves all, or per-district reviewers? Confirm at Phase F2.

---

## Source index

Recency: all sources accessed 2026-05-26.

- https://developers.google.com/search/docs/appearance/structured-data/article
- https://developers.google.com/search/docs/appearance/core-web-vitals
- https://web.dev/articles/defining-core-web-vitals-thresholds
- https://nextjs.org/docs/app/guides/how-revalidation-works
- https://nextjs.org/docs/app/api-reference/functions/revalidateTag
- https://support.google.com/news/publisher-center/answer/9607104
- https://www.searchenginejournal.com/google-updates-article-type-structured-data-guidance/475566/
- https://schemaninja.com/core-update-is-still-rolling-out/
- https://www.digitalapplied.com/blog/structured-data-after-io-2026-schema-updates
- https://www.digitalapplied.com/blog/next-js-15-to-16-migration-playbook-cache-components-2026
- https://www.digitalapplied.com/blog/core-web-vitals-2026-inp-lcp-cls-optimization-guide
- https://dev.to/dharanidharan_d_tech/fix-lcp-inp-cls-in-2026-the-complete-core-web-vitals-guide-with-real-benchmarks-54cl
- https://www.corewebvitals.io/core-web-vitals
- https://nitropack.io/blog/most-important-core-web-vitals-metrics/
- https://presenc.ai/research/state-of-llms-txt-2026
- https://searchsignal.online/blog/llms-txt-2026
- https://www.linkbuildinghq.com/blog/should-websites-implement-llms-txt-in-2026/
- https://www.aeo.press/ai/the-state-of-llms-txt-in-2026
- https://www.indexnow.org/
- https://www.bing.com/indexnow
- https://pressonify.ai/blog/indexnow-instant-indexing-press-releases-2026
- https://www.trysight.ai/blog/automated-indexing-for-news-publishers
- https://brandstory.in/blogs/seo-trends-india-2026/
- https://almcorp.com/blog/bing-ai-performance-webmaster-tools-complete-guide/
