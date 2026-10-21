# YouTube Studio screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone YouTube flow in the admin (upload → Video IQ → publish), with the website article created on demand afterwards, replacing the panel inside the Content editor.

**Architecture:** `VideoOptimization` becomes self-sufficient (optional `contentId`, desk fields, visibility). The worker and publish read desk context and visibility from the row. Three new pages under `/youtube` reuse the existing panel tabs through a `VideoIqWorkspace` component; two new routes create runs from an upload and articles from a run. Pure helpers (`studio.ts`) are unit-tested; routes stay thin.

**Tech Stack:** as Phase A (Next.js 16, Bun, Prisma `db push`, zod 4, bun test, Playwright under Node for the browser smoke).

**Spec:** `docs/superpowers/specs/2026-10-22-youtube-studio-design.md` (and Phase A spec for everything underneath).

## Global Constraints

- Same as Phase A: title shape, category 25, te/te, no URLs from the model, quota budget, bearer-protected cron, secrets from env only, `VIDEO_IQ_YOUTUBE_DRY_RUN` honoured.
- Existing runs (with `contentId`) keep working; nothing in Phase A's tests may break.
- Commit per task with the attribution line; push once at the end (deploy).

## Review Focus

1. A scheduled upload with `publishAt` in the past must be rejected at creation and at PATCH (otherwise YouTube rejects the upload after the 1,600-unit insert). Test in Task 2.
2. "Create website article" pressed twice must not create two articles; the second press opens the existing one. Test in Task 3 (helper) and route guard.
3. "Add website link to YouTube" must be idempotent: a description that already carries the page URL is not re-sent. Test in Task 2.
4. A back-catalog run for a video not on our channel must be refused before any row is created. Test in Task 3 (zod + channel check helper).
5. Deleting the Content linked to a run must not delete the run (SetNull). Covered by the schema relation; checked in Task 1 with `prisma validate` and a db push.

---

### Task 1: Schema

**Files:** `packages/db/prisma/schema.prisma` (model `VideoOptimization`, new model `ChannelVideo`)

**Interfaces:** `contentId String?`, `content Content? @relation(..., onDelete: SetNull)`, new `deskTitle String @default("")`, `deskNotes String? @db.Text`, `breaking Boolean @default(false)`, `district String?`, `visibility String @default("public")`, `publishAt DateTime?`, `durationSec Int?`. New `ChannelVideo` (spec §3.1): `videoId` pk, title, description, tags, publishedAt, durationSec, isShort, privacy, views, likes, comments, thumbnailUrl, categoryId, scores Json, rank, rankQuery, rankCheckedAt, syncedAt.

### Task 1b: Catalog sync + scores (TDD)

**Files:** create `apps/admin/src/lib/video-iq/catalog.ts`, `apps/admin/src/app/api/cron/channel-sync/route.ts`; modify `packages/youtube/src/client.ts` (`listUploads` returns all pages up to 500, `getVideos` chunks of 50), `apps/admin/scripts/cron-runner.ts` (`channel-sync` every 30 min); tests `apps/admin/__tests__/video-iq/catalog.test.ts`.

**Interfaces:** `catalogScores(v: { title; description; tags }): { title: number; content: number }` (title via `scoreTitle` with entities from `peopleIn`/`townsIn`, no volumes; content = round((scoreDescription + scoreTags) / 2)); `syncChannel(deps: { prisma; youtube; channelId; now? }): Promise<{ total: number; updated: number }>` (pages the uploads playlist, fetches details in 50s, upserts `ChannelVideo` with `isShort = classifyFormat(duration, maxres w/h)`, privacy from `status.privacyStatus`, scores); `rankCheck(deps: { prisma; dfs }, videoId): Promise<{ rank: number | null; query: string }>` (query = English half of the title, else the title; rank = position of our videoId in `youtubeSerp`, null when absent).
- Tests: scores for a good and a poor title; sync upserts and sets isShort/privacy/scores from a fake client; rankCheck finds our id at position 3 and null when absent.

- [ ] Edit the model as above (keep both indexes; `@@index([contentId, createdAt(sort: Desc)])` works with a nullable column).
- [ ] `cd packages/db && bunx prisma validate && bunx prisma db push --accept-data-loss && bunx prisma generate` (adds nullable/defaulted columns only; existing rows get `deskTitle` "").
- [ ] Backfill: `UPDATE video_optimizations v SET "deskTitle" = c.title FROM contents c WHERE c.id = v."contentId" AND v."deskTitle" = ''` (run locally via `prisma db execute`; add the same statement to `packages/db/prisma/seed-competitors.ts`? No: add a one-off idempotent step to deploy.yml after db push: `bunx prisma db execute --schema prisma/schema.prisma --stdin <<< "<the update>"`).
- [ ] Commit: `feat(db): standalone Video IQ runs (optional content, desk fields, visibility)`.

### Task 2: Pure helpers + worker/publish changes (TDD)

**Files:** create `apps/admin/src/lib/video-iq/studio.ts`; modify `worker.ts` (desk context from the row), `publish.ts` (visibility → status; article link optional); tests `apps/admin/__tests__/video-iq/studio.test.ts`, extend `worker.test.ts`, `publish.test.ts`.

**Interfaces (studio.ts):**
- `runInputSchema` (zod): `{ source: "blob"|"youtube", blobUrl?: url, videoUrl?: string, deskTitle: string 3..120, deskNotes?: string ≤2000, breaking?: boolean, district?: string, visibility?: "public"|"private"|"scheduled", publishAt?: ISO string }` with refinements: blob needs `blobUrl` on `blob.core.windows.net`; youtube needs a parsable id; scheduled needs `publishAt` > now + 5 min.
- `youtubeIdFrom(input: string): string | null`.
- `visibilityToStatus(v: { visibility: string; publishAt?: Date | null }): VideoStatus`.
- `articlePayloadFrom(run): { title: string; summary: string | null; payload: {...}; editorNote: string; breaking: boolean }` (title = Telugu hook of the chosen title; falls back to deskTitle).
- `descriptionWithArticleLink(current: string, url: string): string | null` (null when already present; otherwise inserts `పూర్తి వార్త: <url>` after the first two lines).
- `runSummary(row): { id, status, deskTitle, score, thumb, videoId, warnings, createdBy, createdAt, contentId }` for the list.

Worker: in `stageTranscribing`, desk context = `{ title: row.deskTitle || content?.title, description: row.deskNotes || content?.summary || content?.body || "", district: row.district || content?.constituency?.district?.nameEn || place?.district, breaking: row.breaking || content?.breaking }`; `content` loaded only when `row.contentId`. Store `durationSec` on the row at QUEUED.
Publish: `status = visibilityToStatus(row)` when the row has no linked content; with linked content keep the Phase A rule (content status wins only if row.visibility is "public" and content is SCHEDULED/PUBLISHED? Simpler: row visibility always wins; the content's SCHEDULED date is ignored). Article URL appended only when a linked Content is PUBLISHED.

- [ ] Write tests (RED), implement, GREEN, commit `feat(video-iq): standalone run helpers; worker and publish read desk context and visibility from the run`.

### Task 3: Routes

**Files:** create `apps/admin/src/app/api/youtube/runs/route.ts` (POST create, GET list), `apps/admin/src/app/api/video-iq/[id]/create-article/route.ts`, `apps/admin/src/app/api/video-iq/[id]/article-link/route.ts`; modify `apps/admin/src/app/api/video-iq/[id]/route.ts` (PATCH accepts `visibility`, `publishAt`; same past-date refinement).

- POST runs: `requireAuth(["ADMIN","EDITOR","SUB_EDITOR"])`; validate with `runInputSchema`; for `youtube` source call `getYouTube(prisma).getVideos([id])` and require `snippet.channelId === CHANNEL_ID` (400 otherwise; 503 when YouTube not configured); 409 when an active run exists for the same `blobUrl`/`videoId`; create row (`source` BLOB/YOUTUBE, `deskTitle`, …, `createdById`); `logAudit("youtube.run.create")`; 201 `{ id }`.
- GET runs: `?status=all|active|ready|published|failed`, newest first, take 100, `include createdBy {name}` → `runSummary` each.
- create-article: 409 unless APPLIED; if `row.contentId` already set → 200 `{ contentId, existing: true }`; else create Content from `articlePayloadFrom(row)` with `slug` null (editor sets it), `status: DRAFT`, `authorId`, `language: TELUGU`; update the run's `contentId`; audit; 201 `{ contentId }`.
- article-link: `requireAuth(["ADMIN","EDITOR"])`; needs APPLIED + linked Content with status PUBLISHED and a slug; url = `${SITE}/videos/${slug}`; fetch current description via `videos.list` (1 unit); `descriptionWithArticleLink` → null → 200 `{ already: true }`; else `updateSnippetStatus(videoId, {...snippet with new description}, undefined)` (50 units); record `applied.articleLink`; 200 `{ url }`.
- [ ] Commit `feat(youtube): run creation and list routes; create article and article link from a run`.

### Task 4: UI

**Files:** create `apps/admin/src/app/(dashboard)/youtube/page.tsx`, `.../youtube/new/page.tsx`, `.../youtube/[id]/page.tsx`, `apps/admin/src/components/youtube/run-list.tsx`, `new-run-form.tsx`, `run-workspace.tsx`; modify `apps/admin/src/components/video-iq/panel.tsx` → extract tab components into `apps/admin/src/components/video-iq/tabs.tsx` and a `VideoIqWorkspace` that takes `{ runId }` (loads by id via `GET /api/video-iq/[id]`), add the Visibility control to the Publish tab, progress rail for in-flight runs, Create website article / Add website link buttons when APPLIED; `use-optimization.ts` → add `useRun(runId)` variant; `content-payload-editor.tsx` → remove `<VideoIqPanel>`, show the "YouTube run" link when `payload.videoId` matches a run (`GET /api/youtube/runs?videoId=`); `sidebar.tsx` → add `{ name: "YouTube", href: "/youtube", roles: ALL, icon: play-triangle path }` before Trending; `roles.ts` needs no change.
- `/youtube/new`: reuse the SAS upload logic from `video-upload.tsx` (copy the SAS+PUT+finalize sequence into `new-run-form.tsx`; progress bar; duration read from a `<video>` element), fields per spec, district options from `GET /api/districts` (exists? if not, add a tiny `GET /api/districts` returning `{ id, nameEn, name }` for active districts), Start → POST → `router.push('/youtube/<id>')`.
- [ ] tsc clean on the new files; commit `feat(youtube): studio screens (list, new upload, workspace); panel removed from the Content editor`.

### Task 5: Browser smoke, docs, deploy

- Local: dev server, `scripts/video-iq-local/ui-smoke-studio.mts`: login → `/youtube/new` → upload the 60 s clip (SAS) → Start → workspace reaches READY (drive the cron route) → Publish (dry run) → Create website article → editor opens with the YouTube link in the payload → screenshots.
- Docs: update `docs/video-iq.md` (flow + screens) and the acceptance doc.
- Suites green; commit; push → deploy; verify on the VM (`pm2 list`, cron log, `GET /youtube` 307).
