# YouTube Studio screens (Video IQ v2) design

Date: 2026-10-22. Owner decision: a YouTube upload is its own thing. No article form, no Content row up front. Upload → Video IQ → Publish to YouTube. A website article is created afterwards, on demand, from the published run.

Builds on `docs/superpowers/specs/2026-10-21-video-iq-design.md` (pipeline, contract, scoring, publish, quota, trending stay as built).

## 1. Goals

- An editor opens **YouTube → New upload**, drops a file, types the Telugu desk title, starts. Within 1 to 3 minutes the same page becomes the Video IQ workspace. Publish writes to the channel.
- Nothing about the website is asked until the editor presses **Create website article** on a published run.
- The old Video IQ panel inside the Content editor is removed.

## 2. Data

`VideoOptimization` changes (`prisma db push`):

| Field | Change |
|---|---|
| `contentId` | optional (`String?`), relation optional |
| `deskTitle` | new `String` (Telugu desk title typed at upload; back-catalog runs copy the YouTube title) |
| `deskNotes` | new `String? @db.Text` (optional desk notes passed to the model as the description context) |
| `breaking` | new `Boolean @default(false)` (drives the thumbnail badge and title scoring) |
| `district` | new `String?` (English district name from the picker; passed to the model) |
| `visibility` | new `String @default("public")`: `public`, `private`, `scheduled` |
| `publishAt` | new `DateTime?` (when visibility is scheduled) |
| `durationSec` | new `Int?` (from the probe; copied to the article payload) |

Existing rows keep their `contentId`; the list shows them too.

Worker reads the desk context from the row (`deskTitle`, `deskNotes`, `district`, `breaking`) and falls back to the linked Content when the row has one and the fields are empty (back-compat for rows made from the old panel). Publish derives `privacyStatus`/`publishAt` from `visibility`/`publishAt` instead of the content status; with a linked, published Content the article URL is still appended.

## 3. Screens (sidebar "YouTube", roles ADMIN, EDITOR, SUB_EDITOR)

### 3.1 `/youtube` catalog (the main screen)
Owner reference (2026-10-22): a third-party "Optimize" grid. Ours shows **the channel's own uploads** as cards, newest first:

- Card: thumbnail (YouTube's, or the run's chosen one), title, views · age, and pills: **Title N** (deterministic `scoreTitle` on the live title), **Content N** (blend of `scoreDescription` and `scoreTags` on the live description/tags), **Thumbnail N** only when a run rendered one; otherwise a **Score video** button that starts a back-catalog run (`source: youtube`). A card with any pill under 70 gets an amber "opportunity" marker; the sort "Opportunities" lists lowest-first.
- Stats under the title: views, likes, comments, age, views/hour vs the channel median of similar-age videos (same outlier math as the trending desk), and the search rank when checked.
- **Check rank** per card (manual, DataForSEO YouTube SERP for the English half of the title, 1 call): stores rank + checked time and shows it on the card. "Not in top 20" is a result too.
- Tabs: **Videos** (long form), **Shorts**, **Channel insights** (28-day views, watch time, subscribers gained, top traffic sources from the Analytics API; a compact strip at the top plus a tab with the per-source table).
- Filters: All / Public / Private (drafts) / Unlisted; search box over title and tags; sort: newest, most views, opportunities (lowest score first), fastest (views/hour).
- Runs that are not yet on YouTube (QUEUED…READY, APPROVED, FAILED) appear as cards at the top with their status chip instead of stats.
- Buttons: **Upload** (→ `/youtube/new`), **Trending desk**. Card click → `/youtube/[id]` when a run exists, else the YouTube watch page; **Score video** creates the run and opens it.

**Channel catalog cache:** new table `ChannelVideo` (`videoId` pk, title, description, tags, publishedAt, durationSec, isShort, privacy, views, likes, comments, thumbnailUrl, categoryId, rank, rankQuery, rankCheckedAt, scores Json {title, content}, syncedAt). Filled by `POST /api/cron/channel-sync` (every 30 minutes from the PM2 runner; also at the end of a publish): `playlistItems.list` on the uploads playlist (1 unit per 50) + `videos.list` (1 unit per 50) → ~12 units per full sync for 250 videos. Scores are recomputed at sync time from the live metadata, so a title fixed in Studio shows its new score within 30 minutes.

### 3.2 `/youtube/new`
One card:
- Source: file drop (MP4/WebM up to 2 GB via the existing blob SAS upload) **or** "Existing YouTube video" with a URL/ID field (back-catalog path, captions).
- Desk title (required, Telugu, ≤120 chars). Notes (optional). Breaking (checkbox). District (select from `District`, optional).
- **Start** → `POST /api/youtube/runs` → row QUEUED → redirect to `/youtube/[id]`.

### 3.3 `/youtube/[id]` workspace
Header: desk title, status chip, scores, Re-run (disabled while in flight), Save, Approve, Publish.
Progress rail while in flight: Upload done → Transcript → Titles & SEO → Thumbnails, each with elapsed time; polls every 5 s.
When READY: the five tabs from the panel, full width. **Publish tab** adds Visibility: Public now / Private / Schedule at (datetime, IST) and shows the quota estimate.
When APPLIED: YouTube link, warnings, and the two follow-ups:
- **Create website article** (hidden once the run has a Content): creates a VIDEO Content, status DRAFT, `title` = chosen title's Telugu hook, `summary` = `summary_te`, `payload` = { videoUrl: watch URL, videoId, thumbnailUrl, transcript, duration }, `editorNote` = "Created from YouTube run <id>", `breaking` from the run, author = current user; links `contentId`; opens `/content/<id>`.
- **Add website link to YouTube** (shown when the linked Content is PUBLISHED and the description does not yet contain the page URL): one `videos.update` that re-sends the finalised description with the article URL (50 units); records `applied.articleLink = url`.

### 3.4 Content editor
The Video IQ panel is removed. A VIDEO article whose payload has a `videoId` that matches a run shows a one-line "YouTube run: <status> · open" link above the video fields.

## 4. Routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/youtube/runs` | ADMIN, EDITOR, SUB_EDITOR | body `{ source: "blob" \| "youtube", blobUrl?, videoUrl?, deskTitle, deskNotes?, breaking?, district?, visibility?, publishAt? }` → creates the run (409 if a run for the same blobUrl/videoId is active). For `youtube` source `deskTitle` defaults to the catalog title. |
| `GET /api/youtube/runs?status=` | staff | runs not yet on YouTube (and recent ones) for the top of the catalog |
| `GET /api/youtube/catalog?tab=videos\|shorts&privacy=all\|public\|private\|unlisted&q=&sort=` | staff | catalog cards from `ChannelVideo` joined with the latest run per videoId |
| `GET /api/youtube/insights` | staff | 28-day channel totals and traffic sources (Analytics API, cached 1 hour in memory) |
| `POST /api/youtube/catalog/[videoId]/rank` | ADMIN, EDITOR | DataForSEO SERP check for the English title half; stores rank |
| `POST /api/cron/channel-sync` | bearer | refresh `ChannelVideo` (every 30 min from the PM2 runner) |
| `GET/PATCH /api/video-iq/[id]` and `approve`/`override`/`publish` | unchanged | PATCH also accepts `visibility`/`publishAt` |
| `POST /api/video-iq/[id]/create-article` | ADMIN, EDITOR, SUB_EDITOR | 3.3 create website article |
| `POST /api/video-iq/[id]/article-link` | ADMIN, EDITOR | 3.3 add website link to YouTube |
| `POST /api/video-iq` (old create-from-content) | kept for back-compat, now also requires no active run | |

## 5. Behaviour rules

- Visibility `scheduled` requires `publishAt` in the future; YouTube gets `privacyStatus: private` + `publishAt`; the comment step is skipped for private/scheduled uploads (added in Phase A).
- `breaking` true → thumbnail badge on, "బ్రేకింగ్" allowed in the title without penalty.
- Back-catalog runs (`source: youtube`) must belong to our channel (`YOUTUBE_CHANNEL_ID`), checked with one `videos.list` call at creation; otherwise 400.
- A run with no Content gets no article link in the description at publish time; the link is added later through "Add website link to YouTube".
- Deleting a Content row sets the run's `contentId` to null (relation `onDelete: SetNull`), the run survives.

## 6. Testing

- Unit: run creation validation (zod), visibility → status mapping, create-article payload builder, article-link description builder (idempotent), list query mapping.
- Worker test: desk context taken from the row when no Content is linked.
- Browser smoke (local): `/youtube/new` upload → workspace READY → Publish (dry run) → Create website article lands in the editor with the prefilled payload.

## 7. Out of scope

Publish slots (12.10), captions upload (12.4), performance loop (12.2) stay in Phase B/C.
