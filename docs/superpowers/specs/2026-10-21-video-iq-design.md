# Video IQ: AI-assisted YouTube packaging and publishing from the CMS

**Date:** 2026-10-21
**Status:** Draft for owner review
**Builds on:** YouTube OAuth plumbing in `scripts/google/` (2026-10-20), the catalog fix applied to all 238 videos on 2026-10-21, `docs/youtube/keywords.md`, `docs/youtube/metadata-rewrite-prompt.md`, `docs/youtube/analytics-2026-10-20.md`.

## 1. Goal

An editor uploads a video (or points at one already on YouTube) inside the admin app, clicks **Optimize**, and gets back, within a few minutes, a package built from what the video actually says: three title options in the Telugu-hook-plus-English form, a description in the channel template, tags, chapters, a thumbnail headline and rendered thumbnail candidates, and a fit report that says whether the video belongs on this channel. The editor approves the title and thumbnail with one click; the mechanical parts are applied automatically; the video is published to the channel through the API. A daily job does the same for anything uploaded directly to YouTube without the panel.

Success looks like:

- A press-meet video of 17 minutes is transcribed, titled with the right names and place, chaptered, and published to YouTube from the CMS in under 10 minutes of editor time.
- No title goes live that contradicts the audio (the Rachamallu "officials vs TDP leaders" error of 2026-10-20 cannot recur).
- Every new upload, from the panel or straight to YouTube, has category News, Telugu language, tags, the English place line and the footer within 24 hours without anyone touching it.
- A video that is not local or is a national repost is flagged before publishing, with the reason.
- The owner sees titles and thumbnails before they go live, per the standing rule.

## 2. Current state

| Piece | Exists | Where |
|---|---|---|
| Azure OpenAI chat with JSON retry | yes | `apps/admin/src/lib/ai/client.ts` (`chat`, `chatJsonWithRetry`) |
| Azure Speech key | yes, used for TTS only | `AZURE_SPEECH_KEY` in admin env |
| Playwright Chromium on the VM | yes | `apps/admin/src/lib/epaper/render-edition.ts` |
| Blob upload for mp4/webm with SAS | yes | `apps/admin/src/app/api/upload/video-sas/route.ts`, `lib/blob.ts` |
| Content types VIDEO and REEL with `videoId`, `thumbnailUrl` | yes | `packages/db/src/payload-schemas.ts` |
| `SocialPost` with platform YOUTUBE and QUEUED/POSTED/FAILED | yes, unused | `packages/db/prisma/schema.prisma` |
| Cron route pattern with `CRON_SECRET` | yes | `apps/admin/src/app/api/cron/publish-scheduled/route.ts` |
| YouTube refresh token, `ytApi()` helper | yes, scripts only | `scripts/google/user-oauth.ts`, `.env.local` |
| Keyword demand map, rewrite prompt, title rules | yes | `docs/youtube/` |
| ffmpeg on the VM | no | add in `deploy.yml` |
| Speech-to-text call, job table, panel UI, YouTube upload from server | no | this spec |

## 3. Data model

### 3.1 `VideoOptimization` (new)

| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `contentId` | String, FK Content, indexed | the VIDEO or REEL row |
| `source` | enum BLOB, YOUTUBE | where the media comes from |
| `blobUrl` | String? | for BLOB |
| `videoId` | String? | for YOUTUBE, also set after publish |
| `status` | enum QUEUED, EXTRACTING, TRANSCRIBING, ANALYZING, READY, APPROVED, PUBLISHING, APPLIED, FAILED | one row per run |
| `transcript` | Json? | `{ locale, durationSec, segments: [{ start, end, text }], words?: [...] }` |
| `suggestions` | Json? | the model output, section 5 |
| `scores` | Json? | section 6 |
| `frames` | Json? | `[ { t: seconds, url } ]`, three candidate stills on blob |
| `thumbnails` | Json? | `[ { headline, frameUrl, renderedUrl } ]` |
| `chosen` | Json? | `{ titleIndex, title, thumbnailIndex, description, tags, chapters }` after editor edits |
| `applied` | Json? | what was actually written to YouTube and when |
| `error` | String? | last failure, human readable |
| `attempts` | Int default 0 | retry counter |
| `createdById` | String, FK User | |
| `createdAt`, `updatedAt` | DateTime | |

Index on `(status, createdAt)` for the worker, `(contentId, createdAt desc)` for the panel.

### 3.2 Existing rows touched

- `Content.payload.videoId` is set after publish (schema already allows it).
- `Content.payload.thumbnailUrl` is set to the rendered thumbnail.
- `SocialPost` row `(contentId, YOUTUBE)` is created QUEUED at approve time, POSTED with `postUrl` after publish, FAILED with `error` otherwise. Nothing else in the schema changes.

### 3.2a `KeywordVolume` (new, cache)

`term` (PK, lower-cased), `volume Int?`, `competition String?`, `fetchedAt DateTime`. Written by the keyword step (4.3a), read by Score and the panel. Rows older than 30 days are refreshed on next use.

### 3.3 Reference tables used read-only

`District`, `Constituency`, and a static place table (the one in `scripts/google/yt-bulk-fix.ts`, moved to `packages/youtube/places.ts`) give the English and Telugu names. Politician names come from a small static list in `packages/youtube/people.ts` seeded from the names that appear in existing titles; editors can extend it later through the panel.

## 4. Pipeline

One worker, triggered by the cron route `POST /api/cron/video-iq` every two minutes (same caller as the other cron routes, `CRON_SECRET` bearer). Each invocation claims up to 3 rows in QUEUED, EXTRACTING, TRANSCRIBING or ANALYZING whose `updatedAt` is older than 90 seconds (so a crashed step is retried, not stuck), runs one stage per row, writes the next status, returns. Stages are idempotent and keep their outputs on the row, so a retry resumes from the last finished stage.

### 4.1 Extract (BLOB only)

`ffmpeg -i <blob SAS url> -vn -ac 1 -ar 16000 -b:a 48k audio.mp3` and `ffmpeg -ss <t> -frames:v 1 frame.png` at 10%, 40% and 70% of the duration. Audio goes to a private blob container `video-iq/<id>/audio.mp3` (deleted after APPLIED or 7 days). Frames go to the public uploads container as JPG, 1280x720. Duration is read from ffprobe and written to `Content.payload.duration`. Videos over 60 minutes or 500 MB are rejected at QUEUED with a clear error; the channel has never published one.

For YOUTUBE source there is nothing to extract: frames are `https://i.ytimg.com/vi/<id>/maxresdefault.jpg` (one candidate), and the transcript comes from captions (4.2).

### 4.2 Transcribe

Azure Speech fast transcription REST (`/speechtotext/transcriptions:transcribe`, API version 2025-10-15 or later), locale `te-IN`, segment and word timestamps on, profanity filter off (news), `phraseList` filled with the district and town names and the people list (section 3.3). Response segments are stored as the transcript. Cost is about 1 USD per audio hour; a 17-minute video is about 30 cents.

For YOUTUBE source: `captions.list` on the video (owner), download the `te` track (ASR or manual) as SRT with `captions.download` (200 units), parse to segments. If no track exists yet (YouTube takes hours to generate ASR), the row waits in TRANSCRIBING and is retried every 30 minutes for up to 24 hours, then falls back to the desk text with `lowConfidence: true` in the suggestions.

### 4.3 Analyze

One `chatJsonWithRetry` call (deployment: the same GPT model the article pipeline uses; budgets 1500, 3000) with:

- system: the rewrite prompt from `docs/youtube/metadata-rewrite-prompt.md` plus the title rules proven this week (Telugu hook first story only, English headline with person and place in standard spelling, 100 characters max, no clock-time claims, "బ్రేకింగ్" only for breaking), the standard Telugu register rule (Eenadu/Sakshi standard Telugu, no dialect), and the description template from `scripts/google/yt-video-fix.ts`.
- user: format (SHORT per the rule in 12.1: vertical and 180 s or less, else VIDEO), the transcript segments with timestamps, the desk's draft title and description, the detected or desk-set district and constituency, the top keyword terms for that district from `keywords.md`, and the date.

Output contract (strict JSON, validated with zod before storing):

```
{
  "format": "SHORT" | "VIDEO",
  "summary_te": string,                      // 1-2 sentences, standard Telugu
  "summary_en": string,                      // 1 sentence with the searchable names
  "titles": [ { "text": string, "why": string } ],   // exactly 3, each <= 100 chars, Telugu hook | English headline
  "description": string,                     // channel template, no URLs invented
  "tags": string[],                          // 15-25, both scripts, from transcript + keyword map
  "hashtags": string[],                      // 3-5, SHORT only
  "chapters": [ { "start": "mm:ss", "title_te": string } ],   // VIDEO only, first at 00:00, 3-8 entries
  "pinned_comment": string,                  // Telugu question + subscribe line, no URL
  "playlists": string[],                     // our fixed playlist names ranked by fit, best first; empty when not_fit
  "thumbnail": { "headline_te": string, "concept": string },  // headline <= 5 words
  "entities": { "people": string[], "places": string[], "parties": string[], "topics": string[] },
  "fit": {
    "district": string | null,
    "local_relevance": number,               // 0-1, 1 = Rayalaseema story
    "reused_content_risk": "low" | "medium" | "high",   // agency footage, other-language captions, third-party clips
    "verdict": "fit" | "borderline" | "not_fit",
    "reason_te": string
  },
  "low_confidence": boolean                  // set when transcript was missing or short
}
```

The model never sees URLs to invent; the article link and footer are appended by code (sitemap lookup as in `yt-video-fix.ts`). The playlist list the model ranks is the channel's own, read from the API at run time and cached for a day: Daily Bulletin, Shorts, District Stories, Politics, Live & Breaking, Devotional, Weather & Agriculture, Rayalaseema Talkies, Special Stories. Category is always 25 News & Politics; the model does not choose it.

### 4.3a Keyword intelligence (DataForSEO)

Runs right after Analyze, before Score, on the same row. Three calls through `scripts/seo/dataforseo.ts` moved into `packages/youtube/dataforseo.ts` with credentials from env:

1. `search_volume` for every English term in the three titles and the tags (one batched call, India, search partners on). Results cached in a new table `KeywordVolume { term PK, volume Int?, competition String?, fetchedAt }` for 30 days, so repeated terms like "proddatur news" cost nothing after the first video.
2. `keyword_suggestions` and `related_keywords` for the main entity (the first person, else the first place, from `entities`), top 20 each with volume.
3. YouTube SERP (`serp/youtube/organic/live/advanced`) for the main query (the English headline of title 1), returning the top 10 with channel, title, views and age.

Stored under `suggestions.keywords = { terms: [{term, volume, competition}], suggested: [{term, volume}], serp: [{rank, channel, title, views, published}] }`. Cost is about one cent per video. Failures (IP not whitelisted, balance, timeout) never block the pipeline: the keyword block is marked `unavailable` and the panel shows why. The VM's public IP goes on the DataForSEO whitelist at deploy time.

### 4.4 Score

Deterministic, computed in code from the suggestions, 0 to 100 each, shown in the panel:

- **Title**: 100 minus 20 if over 100 chars, minus 25 if no English, minus 20 if neither a person nor a place from `entities` appears, minus 15 if "బ్రేకింగ్" appears and the desk did not mark breaking, minus 10 if any clock-time claim, plus 0 to 15 from the highest DataForSEO monthly volume among its English terms (cached per term for 30 days; skipped silently when DataForSEO is unreachable).
- **Description**: first line is a hook (not a URL), place line present, under 5000 chars, no competing-platform links; each miss minus 25.
- **Tags**: 15 to 25 tags, both scripts present, total under 450 chars; each miss minus 25.
- **Thumbnail**: headline 5 words or fewer, chosen frame present, rendered file under 2 MB and 1280x720; each miss minus 33.
- **Fit**: `local_relevance` times 100, capped at 40 when `reused_content_risk` is high.

Overall = weighted mean (title 35, thumbnail 25, description 15, tags 10, fit 15). No AI involvement in scores; the same input always scores the same.

### 4.5 Thumbnails

For each of the 3 frames, Playwright renders `apps/admin/src/lib/video-iq/thumbnail.html` (brand kit from `D:\Downloads\RSN-NEW-LOGOS\RSN`, copied into the repo under `apps/admin/public/brand/`): frame as full background, dark gradient, headline in large Telugu (Noto Sans Telugu bold, auto-sized to fit 2 lines), small RSN logo top-left, optional "బ్రేకింగ్" badge only when the desk marked breaking. Output JPG 1280x720 under 2 MB to the uploads container. The editor can also upload their own still or a finished thumbnail, which skips rendering. Reuses the `chromium.launch()` pattern from `render-edition.ts`.

### 4.6 Review (panel)

In the Content editor for VIDEO and REEL, a **Video IQ** section below the media fields:

- Header: overall score, status pill, "Optimize" button (creates a QUEUED row) and "Re-run".
- Tabs: **Title** (3 options with the why, the title score, and the monthly volume of each English term inside it; pick one, edit in place, live character count), **Thumbnail** (3 rendered candidates, pick, or upload), **SEO** (description, tags with volume beside each, chapters, hashtags, pinned comment, ranked playlists with the top two pre-ticked, all editable; a **Keyword ideas** list from DataForSEO with volume, each with "add to tags" and "use in title"; a **Who ranks today** list for the main query with channel, views and title), **Review** (transcript with timestamps, entities, fit report with the verdict and reason), **Publish** (what will be written, quota estimate, button).
- Fit `not_fit` shows a red banner with `reason_te` and the Publish button is disabled until an admin overrides with a note (stored in `chosen.override`).
- Approve stores `chosen`, sets APPROVED, creates the `SocialPost`.

### 4.7 Publish and apply

- BLOB source: `videos.insert` resumable (1,600 units) streamed from the blob, snippet = chosen title, description, tags, `categoryId 25`, `defaultLanguage te`, `defaultAudioLanguage te`; status = public or private per the Content status (SCHEDULED content publishes as private with `publishAt`); `selfDeclaredMadeForKids false`. Then `thumbnails.set` (50), `playlistItems.insert` for the top two of the ranked `playlists` as ticked in the panel (50 each; none when the fit verdict is not_fit), `videos.update` localizations `en` (50), `recordingDetails` with the place (part of the same update), `commentThreads.insert` of the pinned comment text without links (50). About 1,900 units per video.
- YOUTUBE source: `videos.update` snippet and status (50) plus the same thumbnail, playlist, localisation and comment calls.
- Writes `videoId`, `thumbnailUrl` into `Content.payload`; `SocialPost` POSTED with the watch URL; `applied` on the row; status APPLIED.
- Quota ledger: a new table `YoutubeQuotaDay { date (Pacific calendar day, PK), units Int }` counts every call the app makes by its documented cost; the worker refuses to start a publish that would push the day over 9,000 and leaves the row APPROVED with error "quota, retry after 12:30 IST". The quota extension form is filed as part of this work; until granted, four to five uploads a day is the ceiling.

### 4.8 Autopilot (cron, daily at 06:10 IST)

`POST /api/cron/video-iq-sweep`:

1. List channel uploads from the last 48 hours (`playlistItems.list` on the uploads playlist, 1 unit per page).
2. For each video with no `VideoOptimization` row: create a Content row of type VIDEO or REEL if none exists (title = YouTube title, status DRAFT, sourceUrl = watch URL, same as the import script), then a QUEUED row with source YOUTUBE.
3. The worker runs it through transcribe (captions), analyze, score, thumbnail (one candidate from maxresdefault).
4. **Mechanical auto-apply** without approval: category, language, audio language, tags, description (template with the model's summary), footer, English localisation, playlist. These never change the meaning of the video.
5. **Held for approval**: title and thumbnail. The row stays READY; the panel shows a badge count; a Telegram or WhatsApp message is out of scope for this spec (a webhook hook point is left in the worker).
6. If `fit.verdict` is `not_fit`, nothing is auto-applied; the row is READY with the banner.

Weekly report (Mondays 07:10 IST): `POST /api/cron/video-iq-weekly` reuses `scripts/google/yt-rank-track.ts` logic and the Analytics API to write `docs/youtube/weekly/<date>.md` to blob and the admin dashboard: uploads per day, views, subscribers, hold, search share, tracked ranks, the Shorts test cohort versus baseline.

## 5. Prompt and model contract

- Model: the admin app's existing Azure OpenAI chat deployment (env `AZURE_OPENAI_DEPLOYMENT`), temperature 0.3, JSON mode.
- The transcript is truncated to the first 12,000 tokens if longer (a 60-minute video), with the summary built from the whole set of segment headings.
- Validation: zod schema matching section 4.3; a failed parse after the retry budgets marks FAILED with the raw text in `error` for debugging; the panel offers Re-run.
- Register: the system prompt includes the standard-Telugu rule from the editorial memory (no Rayalaseema dialect in copy).

## 6. Error handling

| Failure | Behaviour |
|---|---|
| ffmpeg missing or crashes | row FAILED with stderr tail; panel shows "video could not be read"; editor can upload a still and retry without audio (desk text path) |
| Speech API error or timeout | retry up to 3 times with backoff, then FAILED |
| No caption track yet (YOUTUBE source) | wait and retry every 30 min up to 24 h, then low-confidence path |
| Model JSON invalid | retry per `chatJsonWithRetry`, then FAILED with raw text |
| YouTube `quotaExceeded` | row stays APPROVED, error set, worker retries after the reset; never loops |
| YouTube `invalid_grant` on the token | all rows pause with a channel-level error shown in the panel header: "YouTube token expired, re-run consent"; nothing else breaks |
| Thumbnail render fails | title and SEO still proceed; thumbnail step marked skipped; editor uploads one |

Every stage logs to the existing audit log (`logAudit`) with the row id, stage, and duration, never the token.

## 7. Security

- Server credentials: `YOUTUBE_OAUTH_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` in `apps/admin/.env` on the VM, written by `deploy.yml` from GitHub secrets, set from the local files by piping (never typed into a command). Not in `apps/web/.env`.
- Cron routes require `CRON_SECRET`. Panel routes require an admin or editor session; Publish requires editor or above; fit override requires admin.
- Audio blobs are private and deleted after use. Transcripts stay on the row (they are useful for captions later).
- The DataForSEO credential moves to env vars (`DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`) with the rotation already pending.

## 8. Testing

- Unit (bun test): scoring rules, title length and English detection with Telugu input, zod validation of the model contract, chapter formatting, quota ledger arithmetic, SRT parsing.
- Integration (local, with env): one 90-second sample mp4 in `apps/admin/test-fixtures/` runs extract, transcribe and analyze end to end against Azure, asserting the row reaches READY with 3 titles under 100 chars and a non-empty transcript.
- YouTube dry-run: `VIDEO_IQ_YOUTUBE_DRY_RUN=1` logs every API call it would make instead of sending; used in CI and the first production day.
- Manual acceptance: publish one real press-meet video through the panel; verify on YouTube: title, thumbnail, chapters visible in the player, playlist membership, English localisation, comment present.

## 9. Deployment

- `deploy.yml`: `apt-get install -y ffmpeg` next to the Playwright install; add the three YouTube env lines to `apps/admin/.env`; `prisma db push` already runs.
- New env on admin: `YOUTUBE_CHANNEL_ID`, `AZURE_SPEECH_REGION` (the key exists), `VIDEO_IQ_YOUTUBE_DRY_RUN`.
- The cron caller on the VM gets two new entries (every 2 minutes for the worker, daily and weekly for the sweeps).
- File the YouTube API quota extension request before go-live; target 100,000 units a day.

## 10. Phasing

1. **Phase A, panel for new uploads:** schema (including 12.1 Shorts rule, 12.5 transcript on site, 12.11 trending tables), worker stages 4.1 to 4.5, panel 4.6, publish 4.7, dry-run flag, tests, trending desk poller and screen. Ends with one real video published through it and the trending screen live.
2. **Phase B, back catalog and learning:** YOUTUBE source via captions so any of the 241 existing videos can be re-optimised from a transcript; captions upload (12.4); performance loop and repackage (12.2); winnable-query finder (12.6); duplicate detection (12.7); canonical names (12.9).
3. **Phase C, autopilot:** the daily sweep with mechanical auto-apply and approval queue, topic playlists (12.8), publish slots (12.10), the weekly report.

## 11. Out of scope

Instagram and X cross-posting from the panel, live streams, a second channel, AI-generated imagery for thumbnails (news thumbnails use real stills), pinning comments (no API), end screens, cards and the Shorts "related video" link (Studio only), visual critique of editing and B-roll (low value per cost; the transcript hook check covers what matters), automatic title swaps more often than once a week.

## 12. Additions from the 2026-10-21 review

Agreed with the owner after a review of what a YouTube growth lead would attack. Each item names its phase.

### 12.1 Shorts classification (A)
A video is a SHORT when ffprobe reports a vertical or square aspect and the duration is 180 seconds or less (YouTube's rule since late 2024), not at 60 seconds. For YOUTUBE source, aspect comes from the thumbnail dimensions. Shorts skip thumbnail rendering (the API cannot set one), the hook headline check applies to the first frame instead, titles keep the hook in the first 40 characters, and hashtags are mandatory.

### 12.2 Performance loop and repackage (B)
At 48 hours and 7 days after APPLIED, the worker stores on the row: views, average view percentage, average view duration, subscribers gained, and the retention curve (`audienceWatchRatio` by `elapsedVideoTimeRatio`). A video below the channel's median views for its age at 72 hours gets a **Repackage** button: new title and thumbnail candidates from the same transcript; one swap per video per 7 days, logged in `applied.history`. Outcomes feed a monthly review of which title patterns outperform; the scorer's weights are adjusted from that, not from opinion.

### 12.3 Hook check (A)
From the transcript: if the first 5 seconds contain a greeting, the channel name, or no content words, the Review tab shows "hook late, news starts at mm:ss" with the exact timestamp. Shorts: the same check against the first 2 seconds.

### 12.4 Captions upload (B)
The transcript, cleaned, is uploaded as a `te` caption track with `captions.insert` (400 units). Default on for long-form, off for Shorts, toggle on the Publish tab.

### 12.5 Transcript on the website (A)
Every video page on the site shows a collapsible cleaned transcript under the player and emits it in the VideoObject schema `transcript` property. The Content row's `payload.transcript` holds it. The YouTube description links to the page; the page embeds the video.

### 12.6 Winnable-query finder (B)
After the SERP for the main query: if the top 5 are all channels above 100,000 subscribers, take the DataForSEO suggestions with volume 50 or more, run up to three more SERP calls, and surface the first query where a channel under 100,000 subscribers sits in the top 5. The panel offers it as the English half of the title with one click.

### 12.7 Duplicate detection (B)
Before READY, compare the transcript (first 300 words, normalised) and title against the catalog's stored transcripts and titles; above 85% similarity the Review tab warns "same as video X" and Publish needs an admin note.

### 12.8 Topic playlists (C)
When an entity (person, place, or event name) appears in three or more published videos, the sweep creates a playlist named for it with a keyworded description, adds the existing videos, and future videos with that entity join automatically. Capped at 30 topic playlists; the oldest inactive one is retired when the cap is hit.

### 12.9 Canonical names (B)
`packages/youtube/people.ts` holds the canonical English and Telugu spelling for each recurring name (Rachamallu Siva Prasad Reddy, Varadarajulu Reddy, Chandrababu Naidu, YS Jagan, Pawan Kalyan, Nara Lokesh, JC Prabhakar Reddy, YS Avinash Reddy, and so on). The analyzer prompt includes it; a post-check rewrites variants in titles, tags and captions. Editors add names from the panel.

### 12.10 Publish slots (C)
Default publish time: long-form at the next slot between 7 and 9 PM IST, Shorts at least two hours apart from the last Short, breaking content now. Editor can override. Implemented through `publishAt` with private status until then.

### 12.11 Trending desk (A)
A competitor radar screen in the admin app.

- `CompetitorChannel { id, channelId, name, tier, active }` seeded with the twenty channels that ranked against us this week (Sakshi TV, Sakshi TV Live, Sakshi TV Politics, TV9 Telugu Live, NTV Telugu, ABN Telugu, ETV Andhra Pradesh, TV5 News, hmtv, 10TV, Mahaa News, CVR News, BIG TV, iNews, Prime9, 99TV, SumanTV, Dial News, Its UTV News, pennerunews). Editable.
- `CompetitorVideo { videoId PK, channelId, title, publishedAt, durationSec, isShort, views, viewSnapshots Json, velocity Float, outlier Float, towns String[], topicKey String }`.
- Poller every 15 minutes: YouTube RSS per channel (`/feeds/videos.xml?channel_id=`, free, 15 latest with view counts), then one `videos.list` per 50 new ids for duration and exact views (about 300 units a day). Velocity = views per hour since publish. Outlier = views divided by the channel's median views at the same age over the last 30 days. Towns detected with the place table. Topic key = normalised entities, so the same story across channels clusters.
- Screen: ranked by velocity or outlier; filters for 6 h, 24 h, 7 d, Shorts or long, Rayalaseema only, cluster view with the count of channels on each story; title pattern miner showing the shared Telugu and English phrases of the top titles in a cluster.
- Breakout alert: three or more channels on one Rayalaseema topic within an hour, or any local video above 10x its channel median, shows a flag on the desk dashboard and a line in the daily sweep report.
- **Create story**: opens a Content draft pre-filled with the topic, entities, the winning title pattern, the winnable query from 12.6, and the standing line "own footage only; competitor video is reference, never re-uploaded". The fit check's reused-content flag remains armed on the resulting video.
