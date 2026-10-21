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

## Step 2: deploy with dry run on (owner)

Push `main` (or `gh workflow run deploy.yml`). Then on the VM: `pm2 list` shows `cron`; `pm2 logs cron` shows `video-iq 200` and `trending-poll 200` lines; `/trending` fills within 15 minutes; one Content row optimised in production reaches READY.

Required before this step: repo secrets `YOUTUBE_OAUTH_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (set 2026-10-22), `AZURE_SPEECH_KEY` (existing), variable `VIDEO_IQ_YOUTUBE_DRY_RUN=1` (set). Optional: `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` after the password rotation, plus the VM's public IP on the DataForSEO whitelist.

## Step 3: first real publish (owner)

`gh variable set VIDEO_IQ_YOUTUBE_DRY_RUN --body 0`, redeploy, run one press-meet video through the panel, review title and thumbnail before Publish. Verify on YouTube: title, thumbnail, chapters in the player, playlist membership, `hl=en` localisation, comment, category News, language Telugu. Record the units from `youtube_quota_days`. Confirm the website page shows the transcript (`curl -s <page> | grep -o '"transcript"'`).

## Next

Phase B (back catalog via captions, 12.2, 12.4, 12.6, 12.7, 12.9) and Phase C (sweep, 12.8, 12.10, weekly report) each get their own plan once step 3 is signed off.
