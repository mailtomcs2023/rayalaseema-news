# Ultra Review Report

**Project:** rayalaseema-express (రాయలసీమ ఎక్స్ప్రెస్)
**Date:** 2026-05-15
**Path:** D:\Rayalaseema express
**Stack:** TypeScript, Next.js 16.2, React 19, React Native/Expo, Prisma 6.4, PostgreSQL, Redis, NextAuth 5.0-beta.25

## Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | 3 | 6 | 3 | 1 | 13 |
| Performance | - | 4 | 4 | 2 | 10 |
| Architecture | - | 5 | 6 | 9 | 20 |
| **Total** | **3** | **15** | **13** | **12** | **43** |

### Top 5 Issues

1. [CRITICAL] Hardcoded API keys in source code (`apps/admin/src/app/api/auto-publish/route.ts:4`, `apps/web/src/app/api/tts/route.ts:3`, `apps/admin/src/app/api/auto-fetch/route.ts:4`)
2. [HIGH] Missing authentication on 35 of 39 admin API routes - anyone can DELETE articles, users, categories
3. [HIGH] N+1 query in district articles - 2×N queries per request (`apps/web/src/lib/db-queries.ts:214`)
4. [HIGH] No input validation - raw `req.json()` passed directly to Prisma update on all PUT routes
5. [HIGH] Weak NextAuth secret in `.env.local` (`"dev-secret-change-in-production"`)

---

## Security Findings

### CRITICAL

#### S1: Hardcoded NewsData API Key
- **File:** `apps/admin/src/app/api/auto-publish/route.ts:4`
- **Description:** API key `pub_599d50a2b3024142bf3f31aef9b6b89b` hardcoded in source. Exposed in repository.
- **Vulnerable code:**
  ```typescript
  const NEWSDATA_KEY = "pub_599d50a2b3024142bf3f31aef9b6b89b";
  ```
- **Fix:**
  ```typescript
  const NEWSDATA_KEY = process.env.NEWSDATA_API_KEY;
  if (!NEWSDATA_KEY) throw new Error("NEWSDATA_API_KEY not configured");
  ```

#### S2: Hardcoded Azure Speech API Key
- **File:** `apps/web/src/app/api/tts/route.ts:3`
- **Description:** Azure Speech key hardcoded as fallback. Exposed credentials can cause unauthorized Azure billing.
- **Vulnerable code:**
  ```typescript
  const SPEECH_KEY = process.env.AZURE_SPEECH_KEY || "44704b838e0c427eb2f01ef2d46e10bd";
  ```
- **Fix:**
  ```typescript
  const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
  if (!SPEECH_KEY) return NextResponse.json({ error: "TTS not configured" }, { status: 503 });
  ```

#### S3: Hardcoded NewsData API Key (duplicate instance)
- **File:** `apps/admin/src/app/api/auto-fetch/route.ts:4`
- **Description:** Same API key hardcoded with env var fallback.
- **Vulnerable code:**
  ```typescript
  const NEWSDATA_KEY = process.env.NEWSDATA_API_KEY || "pub_599d50a2b3024142bf3f31aef9b6b89b";
  ```
- **Fix:** Same as S1 - use env var only, fail if missing.

### HIGH

#### S4: Missing Authentication on All Admin API Routes
- **Files:** 35+ routes in `apps/admin/src/app/api/` - articles, categories, users, polls, ads, breaking-news, comments, galleries, etc.
- **Description:** Admin PUT/DELETE operations have NO auth checks. Middleware only protects page routes, not API routes. Anyone can modify or delete all data.
- **Vulnerable code:**
  ```typescript
  export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    await prisma.article.delete({ where: { id } });
    return NextResponse.json({ success: true });
  }
  ```
- **Fix:** Add session check to every route:
  ```typescript
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  ```

#### S5: No Input Validation on Update Routes
- **Files:** `apps/admin/src/app/api/ads/[id]/route.ts:6`, `categories/[id]/route.ts:7`, `galleries/[id]/route.ts:6`, and 20+ others
- **Description:** Raw `req.json()` passed directly to `prisma.update({ data })`. Allows mass assignment - attacker can set any field.
- **Fix:** Whitelist allowed fields or use Zod schema validation.

#### S6: Weak NextAuth Secret
- **File:** `.env.local:2`
- **Description:** `NEXTAUTH_SECRET="dev-secret-change-in-production"` - trivially guessable, allows JWT forgery.
- **Fix:** Generate with `openssl rand -base64 32` and set in production env.

#### S7: Database Password Exposure
- **File:** `.env.local:1`
- **Description:** Weak password pattern (`Dhruva@123456`) for postgres superuser. Risk if file is committed.
- **Fix:** Use strong random password, non-superuser DB role.

#### S8: Insecure Cookie Configuration
- **File:** `apps/admin/src/lib/auth.ts:63`
- **Description:** `secure: false` on session cookie - tokens transmitted over HTTP, interceptable.
- **Fix:** `secure: process.env.NODE_ENV === "production"`

#### S9: No Rate Limiting on Public Endpoints
- **Files:** `apps/web/src/app/api/comments/route.ts`, `polls/route.ts`, `tts/route.ts`
- **Description:** Comment spam, poll vote manipulation, TTS API abuse (expensive Azure calls) all possible without limits.
- **Fix:** Add rate limiting with `@upstash/ratelimit` or Redis-based limiter.

### MEDIUM

#### S10: Stored XSS via Article Body
- **File:** `apps/web/src/app/article/[slug]/page.tsx:112`
- **Description:** `dangerouslySetInnerHTML={{ __html: article.body }}` without sanitization.
- **Fix:** Use `DOMPurify.sanitize()` before rendering.

#### S11: SSRF in AI Rewrite Route
- **File:** `apps/admin/src/app/api/ai/rewrite/route.ts:40-59`
- **Description:** `scrapeSource(url)` fetches arbitrary URLs without validating against internal IPs.
- **Fix:** Block `localhost`, `127.0.0.1`, `10.*`, `192.168.*`, `172.16.*` and non-HTTP protocols.

#### S12: Vulnerable Dependencies
- **Description:** Next.js 16.2.0 has multiple HIGH-severity advisories (middleware bypass, WebSocket SSRF, DoS). `next-auth 5.0.0-beta.25` has email misdelivery issue.
- **Fix:** `bun update next@latest next-auth@latest`

### LOW

#### S13: Error Messages Expose Internals
- **Files:** Multiple API routes
- **Description:** `catch (error: any) { return NextResponse.json({ error: error.message }) }` leaks stack traces.
- **Fix:** Return generic "Internal server error" in production, log details server-side.

---

## Performance Findings

### HIGH Impact

#### P1: N+1 Query in District Articles
- **File:** `apps/web/src/lib/db-queries.ts:214-242`
- **Description:** For each district, 2 separate queries (constituencies + articles). With ~13 districts = 26 queries per page load.
- **Fix:** Fetch all constituencies and articles in 2-3 total queries, group in memory.

#### P2: N+1 Query in Auto-Publish Category Counts
- **File:** `apps/admin/src/app/api/auto-publish/route.ts:124-128`
- **Description:** `prisma.article.count()` called inside a loop for each category (~20 queries).
- **Fix:** Use `prisma.article.groupBy({ by: ['categoryId'], _count: true })`.

#### P3: N+1 Duplicate Check in Auto-Publish
- **File:** `apps/admin/src/app/api/auto-publish/route.ts:179-184`
- **Description:** `prisma.article.findFirst()` for each news article in loop (60-200 queries).
- **Fix:** Batch-fetch existing titles in one query, check in memory.

#### P4: Missing Full-Text Search Indexes
- **File:** `packages/db/prisma/schema.prisma` (Article model)
- **Description:** Search API uses `contains` on `title`, `summary`, `body` - full table scans without GIN indexes.
- **Fix:** Add PostgreSQL GIN indexes via raw SQL migration.

### MEDIUM Impact

#### P5: Homepage Fetches 500 Articles
- **File:** `apps/web/src/lib/db-queries.ts:76`
- **Description:** `take: 500` on homepage data fetch. Excessive memory and query time.
- **Fix:** Reduce to 100-150 or fetch per-category with smaller limits.

#### P6: No Connection Pooling Configuration
- **File:** `packages/db/.env`
- **Description:** DATABASE_URL has no `connection_limit` or `pool_timeout` parameters.
- **Fix:** Add `?connection_limit=10&pool_timeout=20` to URL.

#### P7: No Caching Strategy
- **Files:** All data fetching in `apps/web/src/lib/db-queries.ts`
- **Description:** Homepage data fetched fresh every request. No Redis or Next.js cache usage.
- **Fix:** Use `unstable_cache` with 60s revalidation, or Redis with 2-minute TTL.

#### P8: Poll Vote Manipulation
- **File:** `apps/web/src/app/api/polls/route.ts:32-43`
- **Description:** No IP/cookie-based vote tracking. Unlimited votes per user.
- **Fix:** Track votes in Redis by IP with TTL.

### LOW Impact

#### P9: Missing Composite Indexes
- **File:** `packages/db/prisma/schema.prisma`
- **Description:** Missing `@@index([status, featured, publishedAt])` and `@@index([categoryId, status, publishedAt])` for common query patterns.

#### P10: Missing Cache-Control Headers
- **Files:** All GET API routes
- **Description:** Only 1 route sets cache headers. Static content re-queried on every request.
- **Fix:** Add `Cache-Control: public, s-maxage=300, stale-while-revalidate=60` to GET routes.

---

## Architecture Findings

### HIGH Priority

#### A1: No Authentication Middleware for API Routes
- **Files:** `apps/admin/src/middleware.ts`, 39+ API routes
- **Description:** Middleware explicitly skips `/api/*`. No reusable auth wrapper exists.
- **Recommendation:** Create `withAuth(handler, allowedRoles)` wrapper in shared package.

#### A2: Swallowed Errors (Empty Catch Blocks)
- **Files:** `apps/admin/src/app/api/articles/route.ts:50`, `auto-publish/route.ts:68`, `telugu-input.tsx:15`, 15+ occurrences
- **Description:** `catch {}` and `catch { return ""; }` hide failures. Impossible to debug.
- **Recommendation:** Log errors with context. Use structured logging (pino).

#### A3: Direct Prisma in UI Components
- **Files:** `apps/web/src/app/category/[slug]/page.tsx:6`, 10+ dashboard pages
- **Description:** Data access mixed with presentation. No service layer.
- **Recommendation:** Move all queries to `packages/db/src/queries/` organized by domain.

#### A4: Zero Test Coverage
- **Description:** No test files found anywhere. No test framework configured.
- **Recommendation:** Start with Vitest for API route integration tests, add Playwright for E2E.

#### A5: Code Duplication Between Apps
- **Description:** Breaking news, comments, and query patterns duplicated between admin and web apps.
- **Recommendation:** Extract shared logic to `packages/db/src/services/`.

### MEDIUM Priority

#### A6: God Files
- **Files:** `schema.prisma` (684 lines), `articles/[id]/page.tsx` (451 lines), `articles/new/page.tsx` (335 lines), `auto-publish/route.ts` (258 lines)
- **Recommendation:** Split article pages into sub-components, extract auto-publish functions.

#### A7: Inconsistent Error Response Formats
- **Description:** Admin uses `{ error }`, reporter uses `{ success, message }`, some routes return empty arrays on error.
- **Recommendation:** Standardize with `ApiResponse.success(data)` / `ApiResponse.error(msg, status)`.

#### A8: Liberal Use of `any` Type
- **Files:** `articles/route.ts:15`, `auto-publish/route.ts:113`, `auth.ts:42,49,50,76`, `reporter/api/client.ts:39`
- **Recommendation:** Use Prisma generated types, create shared interfaces in `packages/db/src/types.ts`.

#### A9: Missing `.env.example` Files
- **Description:** New developers have no documentation of required environment variables.
- **Recommendation:** Create `.env.example` in root and each app.

#### A10: No Logging Infrastructure
- **Description:** Only `console.log`/`console.error`. No structured logging, no error tracking.
- **Recommendation:** Add pino + Sentry.

#### A11: Prisma Schema Design Issues
- **File:** `packages/db/prisma/schema.prisma`
- **Description:** `Reel.views` is String (should be Int), `ArticleReview.action` is String (should be enum), missing indexes on `breaking`/`featured`.

### LOW Priority

#### A12: Hardcoded URLs in Reporter App
- **File:** `apps/reporter/src/api/client.ts:3`

#### A13: Inconsistent Naming Conventions
- **Description:** Mixed variable naming (`b` vs `body`), inconsistent key casing.

#### A14: Inline Styles in React Components
- **Description:** Dashboard pages use inline styles instead of Tailwind classes.

#### A15: Weak Slug Generation
- **File:** `apps/admin/src/app/api/auto-fetch/route.ts:101-120`
- **Description:** Timestamp-based slugs with no uniqueness check.

#### A16-A20: Missing rate limiting, missing CSRF tokens, no dependency injection, Prisma schema could use multi-file split, no request ID tracking.

---

## Recommendations

### Immediate Actions (do now)
- [ ] Remove hardcoded API keys from `auto-publish/route.ts`, `auto-fetch/route.ts`, `tts/route.ts` - use env vars only
- [ ] Add authentication to ALL admin API routes (create `withAuth` wrapper)
- [ ] Generate strong `NEXTAUTH_SECRET` for production
- [ ] Set `secure: true` on session cookies in production
- [ ] Update Next.js to patch known vulnerabilities: `bun update next@latest`

### Short-term (next sprint)
- [ ] Add Zod input validation to all API routes
- [ ] Fix N+1 queries in `getDistrictArticles` and `auto-publish`
- [ ] Add HTML sanitization (DOMPurify) for article body rendering
- [ ] Implement rate limiting on public endpoints (comments, polls, TTS)
- [ ] Add full-text search indexes for article search
- [ ] Standardize error response format across all routes
- [ ] Fix empty catch blocks - add proper error logging
- [ ] Reduce homepage article fetch from 500 to 150

### Long-term (backlog)
- [ ] Set up test infrastructure (Vitest + Playwright)
- [ ] Extract shared services to `packages/db/src/services/`
- [ ] Implement caching layer (Redis or Next.js cache)
- [ ] Add structured logging (pino) and error tracking (Sentry)
- [ ] Split god files (article edit page, auto-publish route)
- [ ] Replace `any` types with proper Prisma/Zod types
- [ ] Add connection pooling configuration
- [ ] Create `.env.example` files for all apps
- [ ] Fix Prisma schema issues (Reel.views type, missing indexes)
- [ ] Add SSRF protection to AI rewrite URL fetching
