# SEO Launch Runbook (Spec #4)

Manual operator steps that can't be automated from code. Companion to the
spec design doc + research doc.

---

## Phase H — Manual operator actions

### H2 (#235) — Google Search Console

Already verified per memory `project_seo_credentials.md` — property
`rayalaseemanews.com` owned by `rsepress2026@gmail.com`. Action items:

1. Open https://search.google.com/search-console
2. Sign in as `rsepress2026@gmail.com`
3. Property → Sitemaps → Add a new sitemap → `sitemap-index.xml`
   (also add `sitemap.xml` + `news-sitemap.xml` individually so the
   per-purpose coverage report works)
4. Property settings → Email notifications → enable for all severities
5. Add `reddygs@medhahosting.com` as backup admin (Settings → Users +
   permissions → Add user → Owner)
6. **Verify baseline:** check the Coverage report shows the expected
   ~400 URLs (8 districts + 55 constituencies + 250 mandals + ~30
   categories + 12 trust pages + N articles).

### H3 (#236) — Bing Webmaster Tools + News PubHub

1. Open https://www.bing.com/webmasters
2. Sign in with the same Gmail (Bing accepts Google sign-in)
3. Add site → `https://rayalaseemanews.com`
4. Verify via the meta-tag option — paste the verification string
   into SiteConfig.bing_webmaster_id via admin → /settings.
   The root layout reads this and renders `<meta name="msvalidate.01">`
   automatically (B2 #198 wiring).
5. Sitemaps → Submit → `https://rayalaseemanews.com/sitemap-index.xml`
6. **Bing News PubHub:** https://pubhub.bing.com — apply with the
   publication name "Rayalaseema Express News", logo, primary language
   `te`, country `IN`. Approval typically takes 2-4 weeks.

### H4 (#237) — Google News Publisher Center

1. https://publishercenter.google.com
2. Sign in as `rsepress2026@gmail.com`
3. Add publication → "Rayalaseema Express News"
4. Required fields:
   - **Property URL:** `https://rayalaseemanews.com`
   - **Country of origin:** India
   - **Languages:** Telugu (te), English (en)
   - **Categories:** News, Local News
   - **Logo (square):** 600x600 PNG (use the masthead-icon-red.png asset)
   - **Logo (wide):** 600x60 PNG
5. Editorial contact: `editor@rayalaseemaexpress.com`
6. Verify ownership via the meta-tag option (or use the GSC-verified
   property as the verification source).
7. After approval the publication ID appears in the Publisher Center
   dashboard — paste it into
   SiteConfig.google_news_publisher_id (A4 #195 column).

Approval typically 2-6 weeks. Until then, the news-sitemap.xml is still
crawled by Googlebot-News and indexes content; Publisher Center
specifically enables the Google News surface (news.google.com) +
publisher-branded Top Stories carousel.

---

## Phase I — Manual launch validation

### I1 (#241) — Pre-launch crawler audit

Use Screaming Frog Free (free tier handles 500 URLs — enough for our
current corpus). Crawl from `https://rayalaseemanews.com` with depth
unlimited. Report on:

- 404s (target: 0)
- Redirect chains > 1 hop (target: 0)
- Duplicate titles (target: 0)
- Missing meta description (target: 0)
- Missing alt text on images (target: < 5%)
- Mixed-content warnings (target: 0)
- Pages with no internal inbound links — orphans (target: 0)

A free alternative is `npx broken-link-checker` against the prod URL.

---

## Phase K — Ops follow-ups

### K10 (#255) — Bing PubHub fast-track

Covered by H3 above. Listed separately in the K-phase because the K-phase
verticals (gold/mandi/devotional) benefit more from Bing IndexNow than
from Google indexing — Bing's vertical SERP surfaces respond faster to
fresh content than Google's.

---

## Sentry account setup

**Web project (apps/web):**
1. https://sentry.io/signup with `rsepress2026@gmail.com`
2. Create project → Next.js → name `rayalaseema-web`
3. Copy DSN → paste into SiteConfig.sentry_dsn_web via admin /settings
4. Verify ingestion: trigger any client error after deploy; Sentry
   should show it within 60 sec.

**Admin project (apps/admin):**
1. Same Sentry org → new project `rayalaseema-admin`
2. Copy DSN → paste into SiteConfig.sentry_dsn_admin
3. Verify ingestion.

DSNs also need to be in deploy.yml as env-var writes to `apps/web/.env`
and `apps/admin/.env` (Sentry's SDK reads the DSN at module-evaluation
time, before any DB call).

---

## Microsoft Clarity account setup

1. https://clarity.microsoft.com (free, unlimited sessions)
2. Sign in with `rsepress2026@gmail.com` (Clarity accepts Microsoft +
   Google + email)
3. Create project → name "Rayalaseema News" → URL
   `https://rayalaseemanews.com`
4. Copy the Project ID → paste into SiteConfig.clarity_project_id
5. Layout.tsx already loads the Clarity loader when the ID is present
   (H5 #238 — code path was shipped pre-spec).
6. Verify in Clarity dashboard: live sessions appear within 10 minutes.
