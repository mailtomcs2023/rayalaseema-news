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

## Step 2: deploy with dry run on (done 2026-10-22, deploy run 39670409296)

Merged to `main` (after merging origin's press-card PRs; conflicts in deploy.yml and two .gitignore files resolved by keeping both sides) and pushed. Verified on the VM with `az vm run-command` right after the deploy:

- `ffmpeg version 6.1.1-3ubuntu5` installed; PM2 shows `web`, `admin` and the new `cron` process online.
- `apps/admin/.env` carries all Video IQ keys (YouTube token and client, channel id, dry-run flag, Azure Speech, DataForSEO, CRON_SECRET).
- `POST /api/cron/video-iq` → `{"processed":[]}`; `POST /api/cron/trending-poll` → 14 channels, 210 new videos on the first tick; `pm2 logs cron` shows publish-scheduled / video-iq / trending-poll returning 200.
- Tables: 14 competitor channels, 211 competitor videos, quota ledger started.
- `https://admin.rayalaseemanews.com/trending` answers (login redirect when logged out); `https://rayalaseemanews.com/videos` 200.

A second deploy (run 39671518603) then set `VIDEO_IQ_YOUTUBE_DRY_RUN=0` and shipped the private-comment fix; the VM env shows `"0"`. One production Optimize was queued on the blob-hosted "gandhi-jayanti-special-story" video to prove the Linux pipeline end to end; the owner queued a 274 s upload through the live panel at the same time. Both reached **READY on the production server** (ffmpeg, Azure Speech, Azure OpenAI, Playwright thumbnails on the VM) between 20:41 and 20:47 UTC. A third deploy (run 39672997396) made the worker carry a run through all stages in one tick and refuse a duplicate Optimize while one is active (the owner had pressed Re-run during the first run).

## Step 3: first real publish (done 2026-10-22, private test video)

Run: `cd apps/admin && bunx tsx scripts/video-iq-local/live-publish-private.mts <blob-url> viq-live-private` with `VIDEO_IQ_YOUTUBE_DRY_RUN=0` on the 60 s re-encoded clip from blob (real HTTPS fetch), content DRAFT so the upload is **private**, playlists cleared so no public playlist shows a private entry.

| Stage | Time |
|---|---|
| QUEUED → EXTRACTING (download + probe + 3 frames) | 3.6 s |
| EXTRACTING → TRANSCRIBING (Azure Speech) | 7.4 s |
| TRANSCRIBING → ANALYZING (model + keywords) | 29.5 s |
| ANALYZING → READY (3 thumbnails) | 11.6 s |
| publish (resumable insert 10.9 MB + thumbnail + localisation) | 18.9 s |

Result read back from the API: video `8EKnCxpOqVM`, title "ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై రాళ్ల దాడి | Proddatur YSRCP candidate house attack in Kadapa", privacy private, category 25, defaultLanguage/defaultAudioLanguage te, 25 tags, maxres thumbnail set, embeddable, not made for kids, localisations te + en. Quota ledger after the run: 5,459 units for the Pacific day (two dry runs plus this upload). The comment step returned 403 "insufficient permissions": YouTube does not allow comments on private videos; the same token posted comments on public videos on 2026-10-20, and the step now skips private uploads instead of warning. DataForSEO still reported "IP not whitelisted" from this machine.

Owner follow-up on `8EKnCxpOqVM`: delete it in Studio, or set it public (the chapters/comment can then be added by publishing the row again as PUBLISHED content). For the first public publish through the panel, review title and thumbnail before Publish per the standing rule, then check the watch page, `hl=en`, playlist membership and the website transcript.

## Studio screens (2026-10-22, spec `docs/superpowers/specs/2026-10-22-youtube-studio-design.md`)

Browser smoke on the local admin dev server (`scripts/video-iq-local/ui-smoke-studio.mts`), after `POST /api/cron/channel-sync` pulled the catalog (243 videos, 243 updated):

- `/youtube`: 243 catalog cards with thumbnail, title, views, age, views/hour, Title and Content score pills, "Score video" on un-run videos, "optimised" plus a Thumbnail pill on the private test upload, amber "opportunity" markers, Check rank links; Shorts tab; sort by opportunities; **Channel insights** tab from the Analytics API: 27.2K views / 90 h watch time / +35 −3 subscribers in 28 days, 232 subscribers, 236 videos, 179.2K lifetime views, traffic sources led by the Shorts feed at 91.3% and YouTube search at 3.4%. Screenshots `studio-1-catalog.png`, `studio-1b-opportunities.png`, `studio-1c-shorts.png`, `studio-1d-insights.png`.
- `/youtube/new`: the 60 s clip uploaded straight to blob via SAS, desk title typed, Breaking ticked, **Start Video IQ** created a standalone run (no Content row, `breaking: true`, visibility public by default) and opened `/youtube/<id>` with the progress rail. Screenshots `studio-2-new.png`, `studio-3-progress.png`.
- Worker: QUEUED → READY in one cron tick (~65 s) once the 90 s claim window passed.
- `/youtube/<id>`: Save (title 2, visibility Private) → Approve → Publish behind the confirm dialog ("as a private video") → APPLIED with id `DRYRUN00000`; the server logged insert, thumbnail, two playlists and localisation, and skipped the comment for the private upload. **Create website article** created a DRAFT VIDEO article (YouTube watch URL, video id, thumbnail, transcript, duration, summary, editor note, breaking) linked to the run and opened the editor. Screenshots `studio-4-ready.png`, `studio-5-applied.png`, `studio-6-article.png`.
- Defect found and fixed on the way: Approve returned 500 for a standalone run because it upserted a SocialPost keyed by the (null) content id; the upsert is now skipped when no article is linked.

## Live workspace (2026-10-24, owner feedback "stuck, blind, ugly stepper")

Found on the server: a "Score video" run on `HtdbtB_XB84` sat 12 hours at "captions not ready, poll 1/48" because the 30-minute spacing was measured from `updatedAt`, which every worker claim bumps every 2 minutes, so it never polled again; and a fresh upload waited up to 3.5 minutes (2-minute tick plus 90 s claim window) before anything visible happened.

Fixed and verified locally in the browser (`ui-smoke-studio.mts`):

- Start → the create route kicks the worker right away; the activity feed showed "Downloading the video and reading it with ffmpeg" 3 s after Start and "Video is 01:00, 1280×720, with audio → a long-form video" 8 s later; READY at 80 s, no cron call involved. Screenshots `studio-3-progress.png` (live state: video, feed, skeletons) and `studio-4-ready.png` (score ring 91, scorecard, titles with scores, three branded thumbnails with the breaking badge, SEO, fit, publish).
- Caption polling now records `lastPollAt` and waits 30 minutes from it; a waiting run shows the amber "Waiting for YouTube's Telugu captions" box with **Analyse now from the title**.
- Save (private) → Approve → Publish (dry run) → Create website article all passed on the new screen; tests 108/108.

## Per-field AI regenerate and gpt-5.5 (2026-10-24, owner: "where is to generate from AI to fit the score and regenerate if I don't like")

Azure inventory on `rayalaseema-ai` (southindia): deployments `gpt51` (gpt-5.1), `gpt41-mini` and, created today, `gpt55` (gpt-5.5, GlobalStandard, capacity 10). gpt-5.6 variants are listed in the region catalog but not deployed. Video IQ (analysis and regenerate) now reads `AZURE_OPENAI_VIDEOIQ_DEPLOYMENT` (set to `gpt55` in deploy.yml and the local env); the compose pipeline stays on `gpt51`. gpt-5.5 rejects any `temperature` except its default, so the shared client omits the field when a caller passes `temperature: null`; the first gpt-5.5 run failed on that before the fix and then reached READY (title 85, thumbnail 100, description 100, tags 100, fit 40, overall 86).

Every scored field in the workspace shows its score pill plus the rubric reasons ("no priced search term in the English half", "first line must be the Telugu hook, not a link", …) and a ✨ button with an instruction box: Regenerate titles, Rewrite description, Suggest more tags, Regenerate chapters, Rewrite comment, plus "Undo last AI change". The route `POST /api/video-iq/[id]/regenerate` sends the model the transcript, the current value, the reasons it scored what it scored and the editor's instruction; the result is cleaned (no URLs, length caps, dedupe) and scored before it reaches the UI.

Verified locally in the browser (`ui-smoke-studio.mts … regen`, screenshot `studio-7-regen.png`) on the READY gpt-5.5 run:

| step | result |
| --- | --- |
| ✨ Regenerate titles with "name the candidate and the town, keep it under 90 characters" | 3 AI titles added above the 3 originals, each with score, length and reasons, about 40 s after login including page load |
| ✨ Rewrite description with "4 sentences, name the candidate" | 468-character hook-first description, score 100, "passes every check", 5 s |
| ✨ Suggest more tags with "add municipal election terms in Telugu" | tags merged to 25/30 (397/450 chars), score 100, 9 s |
| Save | the AI-rewritten title persisted as the chosen title |

Direct helper check against live gpt-5.5 (`test-fixtures/regen-live.mts`): 3 scored title candidates with reasons in 9.3 s. Tests: `apps/admin` 116/116, `packages/youtube` 59/59. The title length readout now says "69/100 chars" so it is not read as a second score.

Deployed in run 40113391719 (commit `0120628`, green 16:52 UTC). Verified on the VM with `az vm run-command`: `apps/admin/.env` carries `AZURE_OPENAI_VIDEOIQ_DEPLOYMENT="gpt55"` and `VIDEO_IQ_YOUTUBE_DRY_RUN="0"`, PM2 web/admin/cron online, `POST /api/video-iq/<id>/regenerate` answers 401 unauthenticated on admin.rayalaseemanews.com, and a probe from the VM against the `gpt55` deployment returned model `gpt-5.5-2026-04-24` in 1.35 s with no temperature sent.

## Next

Phase B (back catalog via captions, 12.2, 12.4, 12.6, 12.7, 12.9) and Phase C (sweep, 12.8, 12.10, weekly report) each get their own plan.
