# Video IQ Phase A acceptance

Plan: `docs/superpowers/plans/2026-10-21-video-iq-phase-a.md` (Task 18). Branch `feat/video-iq-phase-a`.

## Step 1: local end-to-end dry run (done 2026-10-22, 00:40 IST)

Run: `cd apps/admin && bunx tsx scripts/video-iq-local/dry-run.mts <sample.mp4>` under Node, with `VIDEO_IQ_YOUTUBE_DRY_RUN=1`, real Azure Speech, Azure OpenAI, Azure Blob, DataForSEO and the channel's YouTube token (dry-run client; only `playlists.list` went to YouTube).

Input: channel bulletin "నీలకంఠరావుపేటలో పోలీసుల ఫ్లాగ్ మార్చ్ | ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి", 274 s, 1280x720, 56 MB, read from disk (the blob fetch path is exercised in step 3).

| Stage | Time | Result |
|---|---|---|
| QUEUED → EXTRACTING | 3.3 s | probe ok, 3 frames at 27 s / 110 s / 192 s uploaded to blob |
| EXTRACTING → TRANSCRIBING | 11.0 s | Azure Speech te-IN: 396 words, 38 segments, 274.2 s |
| TRANSCRIBING → ANALYZING | 59.4 s | model JSON valid on the 2nd budget (first attempt truncated at 1,500 tokens → budgets raised to 3,000/6,000); DataForSEO refused: IP not whitelisted |
| ANALYZING → READY | 13.9 s | 3 branded thumbnails rendered (184 KB each), scores computed |
| APPROVED → APPLIED (dry run) | 1.8 s | `[yt dry-run]` lines for videos.insert, thumbnails.set, 2× playlistItems.insert, localizations, commentThreads.insert; video id `DRYRUN00000` |

Outputs:

- Format VIDEO; low_confidence false; hook check **late, news starts at 00:21** ("no speech in the opening"), which matches the bulletin's music opener.
- Titles (chars): "ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై రాళ్ల దాడి | Proddatur tension, Varadarajulu Reddy row" (92); "కడపలో వైసీపీ అభ్యర్థి ఇంటిపై దాడి కలకలం | Kadapa Proddatur row, Varadarajulu Reddy heat" (87); "ప్రొద్దుటూరులో నరసింహారెడ్డి ఇంటిపై దాడి | Proddatur YSRCP clash, Varadarajulu Reddy name in row" (96).
- Fit: verdict fit, district Kadapa, local relevance 1.0, reused-content risk medium (bulletin carries a Mumbai and an Egypt item).
- Chapters: 8, from 00:00 to 04:28, Telugu, taken from the transcript. Tags 25 (mixed script). Playlists ranked Politics, District Stories, Daily Bulletin. Pinned-comment text generated, no URL.
- Scores: title 85 (no priced keyword because DataForSEO was unavailable), thumbnail 100, description 75, tags 100, fit 100, overall 91.
- After publish: row APPLIED; content payload has `videoId`, `thumbnailUrl`, `transcript` (3,099 chars); SocialPost YOUTUBE = POSTED; quota ledger 2026-10-21 (Pacific) = 1,852 units, matching the estimate.
- Thumbnail reviewed by eye: frame from the bulletin, RSN mark, headline "ప్రొద్దుటూరులో రాళ్ల దాడి" in Anek Telugu Bold, correct conjuncts.
- Website: `/videos/<slug>` renders the transcript in a collapsible block and in VideoObject JSON-LD (verified on localhost with a Playwright screenshot during Task 14).

Findings from the run (already applied on the branch): model token budgets 1,500/3,000 → 3,000/6,000. Open: DataForSEO IP whitelist (owner), `description` score penalises the missing place line that publish adds later (minor, deferred).

## Review fix pass (2026-10-22, before merge)

A fresh whole-branch review found 1 Critical, 7 Important and 17 Minor items. Fixed and covered by `apps/admin/__tests__/video-iq/fix-pass.test.ts` (all RED first, then GREEN):

- **C1** a YouTube-source row without a Telugu caption track polled `captions.list` (50 units) every 2 minutes and could burn the whole daily quota. Now: one poll per 30 minutes, 48 polls max, then the analysis runs on desk text alone (low confidence).
- **I1** the publish route marked any failure FAILED. Now `publishOptimization` owns the status: retryable failures (quota, auth, blob fetch, precondition) keep the row APPROVED and map to 429 / 503 / 502 / 409; only a bookkeeping failure after a successful upload becomes FAILED, with the video id kept so nothing re-uploads.
- **I2** the desk's breaking flag now drives the thumbnail badge and the title score.
- **I3** Publish is disabled while the panel has unsaved edits, and the confirm dialog quotes the saved title.
- **I4** `processQueue` claims each row with a conditional update, so two runners never process the same row twice (exercised for real below with two overlapping drivers).
- **I5** re-optimising a YouTube-hosted video sends the snippet only unless the content is PUBLISHED/SCHEDULED, so a live video is never flipped private.
- **M8** (re-graded Important) the transcript written to the payload is capped at 60,000 characters, the payload schema's limit.
- The cron runner runs its jobs independently (a slow Video IQ tick no longer delays scheduled publishing).

Production VM check (`az vm run-command`, 2026-10-22): no crontab, cron.d or systemd timer calls `/api/cron/*` today (only the `indexing-api-rotate` crontab exists), PM2 runs `web` and `admin` only, `contents` has 0 rows in SCHEDULED, ffmpeg is not installed yet (deploy.yml installs it), public IP `20.198.2.80` (add to the DataForSEO whitelist). So the new PM2 `cron` process is the first scheduler: no double runs, no backlog to flush.

Deferred minors (reviewer M1–M7, M9–M17) are listed in the ledger and the final report; none blocks the dry-run deploy.

## Browser smoke (2026-10-22, local admin dev server, Playwright under Node)

Scripts: `apps/admin/scripts/video-iq-local/ui-smoke.mts`, `ui-smoke-trending.mts`, run against `bun run dev` on port 3001 with a temporary local admin user.

- Login → `/content/<id>` of a VIDEO row whose file is on blob → the Video IQ panel renders under the video fields → **Optimize** queues a run through `POST /api/video-iq` (toast "Queued; analysis takes a few minutes", status chip QUEUED). Screenshot `ui-1-queued.png`.
- The first attempt surfaced a real defect: ffmpeg could not read the blob URL over HTTPS (Azure Blob replies without `Accept-Ranges`; the clip's index was at the end of the file, as on many phone recordings). Fixed by downloading a remote source once to a temp file before any ffmpeg call (`media.ts` `withLocalSource`), with a unit test against a local HTTP server.
- Two overlapping cron drivers called `POST /api/cron/video-iq` every 15 to 20 s; each stage was processed exactly once (the other caller got `processed: []`), proving the row claim.
- The second attempt surfaced another defect: the model returned a title of more than 100 characters and the run was marked FAILED as a permanent "model output invalid". Fixed: soft violations (title length, list sizes) are repaired before validation, and a genuinely invalid output is retried up to three attempts.
- Third run, all through the real UI and routes: Optimize → worker (READY in 5.7 min wall-clock, dominated by the 90 s claim window between stages) → panel shows status, scores, three titles, thumbnails, SEO, review and publish tabs → **Save** (title 2, `PATCH`) → **Approve** (`POST …/approve`) → **Publish** (`POST …/publish`) behind the confirm dialog quoting the saved title and the quota estimate. Result: run APPLIED with id `DRYRUN00000`, every step applied (insert, thumbnail, 2 playlists, localisation, comment), no warnings; content payload has `videoId`, `thumbnailUrl`, `transcript` (888 chars); SocialPost YOUTUBE = POSTED; audit log has queue / approve / publish; quota ledger 3,705 units after the two dry runs. Screenshots `ui-2-ready.png`, `ui-tab-*.png`, `ui-3-confirm.png`, `ui-4-applied.png`.
- Two more defects found and fixed on the way: the title repair cut a Telugu word in half (now trims at a word boundary), and the panel's header buttons needed stable test ids.
- `/trending` renders the desk (100 videos in 24 h; 13 with Rayalaseema towns; clusters view) and **Create story** opens a prefilled DRAFT in the editor. Screenshots `ui-trending-*.png`. A trailing ": 🔴 LIVE" title slipped through the live filter and into the draft title; both fixed.

## Step 2: deploy with dry run on (owner)

Push `main` (or `gh workflow run deploy.yml`). Then on the VM: `pm2 list` shows `cron`; `pm2 logs cron` shows `video-iq 200` and `trending-poll 200` lines; `/trending` fills within 15 minutes; one Content row optimised in production reaches READY.

Required before this step: repo secrets `YOUTUBE_OAUTH_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (set 2026-10-22), `AZURE_SPEECH_KEY` (existing), variable `VIDEO_IQ_YOUTUBE_DRY_RUN=1` (set). Optional: `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` after the password rotation, plus the VM's public IP on the DataForSEO whitelist.

## Step 3: first real publish (owner)

`gh variable set VIDEO_IQ_YOUTUBE_DRY_RUN --body 0`, redeploy, run one press-meet video through the panel, review title and thumbnail before Publish. Verify on YouTube: title, thumbnail, chapters in the player, playlist membership, `hl=en` localisation, comment, category News, language Telugu. Record the units from `youtube_quota_days`. Confirm the website page shows the transcript (`curl -s <page> | grep -o '"transcript"'`).

## Next

Phase B (back catalog via captions, 12.2, 12.4, 12.6, 12.7, 12.9) and Phase C (sweep, 12.8, 12.10, weekly report) each get their own plan once step 3 is signed off.
