# Video IQ

AI optimisation and one-click YouTube publishing for VIDEO and REEL content,
plus the trending desk. Spec: `docs/superpowers/specs/2026-10-21-video-iq-design.md`.
Plan: `docs/superpowers/plans/2026-10-21-video-iq-phase-a.md`.

## What it does (studio screens, 2026-10-22)

1. **YouTube → Upload** (`/youtube/new`): drop the file (goes straight to blob), type the Telugu desk title, optional notes, Breaking, district, visibility (Public now / Private / Schedule at). **Start Video IQ** creates a standalone run; no website article exists yet.
2. The run starts seconds after Start (the create route kicks the worker; the PM2 `cron` tick every 2 minutes is the fallback) and carries the video through all stages in one go, usually 1 to 2 minutes:
   `QUEUED` (download + probe + 3 frames) → `EXTRACTING` (audio → Azure Speech te-IN) → `TRANSCRIBING` (Azure OpenAI suggestions, DataForSEO keywords, hook check) → `ANALYZING` (branded thumbnails, scores) → `READY`. Each milestone is appended to the run's activity feed (`events`), so the screen always says what the server is doing.
3. The workspace (`/youtube/[id]`) is one live page: the video, the activity feed and the transcript on the left; the scorecard, titles, thumbnails, SEO, channel fit and the publish box on the right, each filling in the moment its data arrives (skeletons before). **Save**, **Approve** (editor or admin), **Publish** to the channel with category 25, Telugu, thumbnail, playlists, English localisation and (on public videos) a comment. A back-catalog run that is waiting for YouTube's Telugu caption track polls every 30 minutes for up to 24 hours and offers **Analyse now from the title**.
4. After publish: **Create website article** makes a DRAFT VIDEO article with the YouTube link, thumbnail and transcript and opens the normal editor; once that article is published, **Add website link to YouTube** appends the page URL to the description.
5. **YouTube** (`/youtube`): the channel catalog, synced every 30 minutes (`/api/cron/channel-sync`, ~12 units): every upload with views, age, views/hour, Title and Content scores computed from the live metadata, Thumbnail score when a run rendered one, **Score video** to start a back-catalog run, **Check rank** (DataForSEO) per video, Videos / Shorts / Channel insights tabs, All / Public / Drafts / Unlisted filters, search, sort by newest / views / fastest / opportunities (lowest score first; amber cards are under 70).
6. The trending desk (`/trending`) polls 14 watched Telugu channels' RSS every 15 minutes; **Create story** opens a prefilled draft; the dashboard shows a breakout banner when 3+ channels carry one local story within an hour.

The Video IQ panel no longer lives in the Content editor; a video article created from a run shows a "YouTube run" link there instead.

**Regenerate with AI (2026-10-24).** Every field in the workspace has a ✨ button with an optional instruction box: Regenerate titles (three new scored candidates appear above the originals), Rewrite description, Suggest more tags, Rewrite comment, Regenerate chapters, Suggest hashtags (Shorts). The prompt carries the transcript, the current value, the plain-words reasons behind its score (shown live next to each score) and the editor's instruction; the result is cleaned (no URLs), validated and scored before it appears. Nothing is saved until Save; the SEO section has "Undo last AI change". Route: `POST /api/video-iq/[id]/regenerate { field, current, instruction? }`.

**Scoring rules that matter in practice (2026-10-24, owner report "AI suggesting like dumb").** The title rubric is 85 points for shape and facts plus 15 for a search term in the English half. A *person or place from the story* now counts in either script and in inflected Telugu (`కేతిరెడ్డికి` matches the entity `కేతిరెడ్డి వెంకట్రామిరెడ్డి`; `Dharmavaram` matches `ధర్మవరం` through `places.ts` / `people.ts`); generic words inside entity names (జిల్లా, సీఐ, MLA, రెడ్డి, …) never count on their own. The 15 search-term points go to the highest-volume priced term in the English half (log scale: 1,000 searches/month = the full 15); when no term is priced, a Rayalaseema place or a known person in the English half earns the full 15, so a title can reach 100 without DataForSEO. The regenerate prompt lists the **canonical English spellings** of the story's entities and the priced terms by volume, so the model's rewrite satisfies the same checks the scorer applies.

**Fit** grades the video, not the metadata: local relevance × 100, capped at 40 when the model saw reused clips (viral or national items). The scorecard and the fit box spell out the reasons (`explainFit`) and the way to 100: trim the non-local clips before upload, or an admin records an override with **Our own footage** ticked (`POST /api/video-iq/[id]/override { note, originalFootage: true }`), which lifts the cap and re-scores. The scorecard is live: it re-scores title, description and tags as the editor types ("live · unsaved" chip), and Save stores the same numbers (`PATCH` recomputes `scores` from the saved choice).

**✨ Optimise to 100** (header button) runs the whole pass in one click: if every keyword term is still unpriced it calls **Price keywords now** (`POST /api/video-iq/[id]/reprice`, DataForSEO, for runs analysed before the server IP was whitelisted), then regenerates title, description and tags while they are under 100 (two passes), fills an empty pinned comment and empty chapters, keeps only candidates that score higher, and reports "Optimised: title 65→100, …". Nothing is saved until Save. The same Price keywords button sits under the Search demand list and the Keyword ideas list whenever volumes are missing.

**Model.** Video IQ uses the deployment named by `AZURE_OPENAI_VIDEOIQ_DEPLOYMENT` (production: `gpt55` = gpt-5.5, created 2026-10-24 on `rayalaseema-ai`, southindia, GlobalStandard, pay per token), falling back to `AZURE_OPENAI_COMPOSE_DEPLOYMENT` and then `gpt51`. The rest of the CMS still uses gpt-5.1. To try another model, deploy it on the same resource (`az cognitiveservices account deployment create …`) and change the variable; no code change. Models available in the region as of 2026-10-24 go up to gpt-5.5 and the gpt-5.6 variants.

## Pieces

| Where | What |
|---|---|
| `packages/youtube` | Pure logic: places, people, Shorts rule (vertical and ≤180 s), YouTube client with quota accounting + dry run, DataForSEO client, model contract (zod), scoring, description template, SRT, RSS, trending math |
| `apps/admin/src/lib/video-iq/*` | media (ffmpeg), transcribe, analyze (prompt), keywords (cache), thumbnail (Playwright), worker (stage machine), quota (ledger), publish, chosen, trending, story-draft |
| `apps/admin/src/app/api/video-iq/*` | create / read / choose / approve / override / publish |
| `apps/admin/src/app/api/cron/video-iq`, `.../trending-poll` | worker and poller entry points (Bearer `CRON_SECRET`) |
| `apps/admin/src/components/video-iq/*` | the panel |
| `apps/admin/src/app/(dashboard)/trending` | the desk |
| `apps/admin/scripts/cron-runner.ts` | PM2 process `cron`: calls the cron routes on a schedule |
| `packages/db/prisma/seed-competitors.ts` | watched channels (idempotent) |

Tables: `video_optimizations`, `keyword_volumes`, `youtube_quota_days`, `competitor_channels`, `competitor_videos`.

## Environment (admin app)

| Var | Purpose |
|---|---|
| `YOUTUBE_OAUTH_REFRESH_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | channel account OAuth (`bun scripts/google/oauth-consent.ts --profile=youtube` writes the token to `.env.local`) |
| `YOUTUBE_CHANNEL_ID` | `UCFZ-DcNTGQsTBpCmZk1MflA` |
| `VIDEO_IQ_YOUTUBE_DRY_RUN` | `1` logs every YouTube write (`[yt dry-run] …`) and returns video id `DRYRUN00000`; `0` sends them. Production reads the GitHub repo **variable** of the same name (default `1`). |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Telugu fast transcription |
| `AZURE_OPENAI_*`, `AZURE_OPENAI_COMPOSE_DEPLOYMENT` | suggestions model (already present) |
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | keyword volumes, ideas, YouTube SERP. The VM's public IP must be whitelisted at https://app.dataforseo.com/api-access (get it with `curl -s https://api.ipify.org` on the VM via `az vm run-command`). |
| `CRON_SECRET`, `CRON_BASE_URL` | cron runner auth and target |

Binary dependencies on the VM: `ffmpeg` (apt, installed by deploy.yml) and Playwright Chromium (already installed for the e-paper renderer).

## Running locally

```bash
# once
winget install Gyan.FFmpeg            # Windows; apt-get install ffmpeg on Linux
bun install && cd packages/db && bunx prisma db push && cd ../..
bun run db:seed:competitors

# tests
cd packages/youtube && bun test __tests__/
cd apps/admin && bun test __tests__/video-iq/

# drive the worker by hand (admin dev server on :3001, CRON_SECRET in apps/admin/.env)
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/video-iq
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/trending-poll

# or run the scheduler itself
cd apps/admin && bun scripts/cron-runner.ts
```

Playwright cannot launch Chromium under Bun on Windows (the remote-debugging pipe is not supported), so the thumbnail unit test skips there with an explicit log line. Verify the renderer with Node instead:
`cd apps/admin && bunx tsx scripts/video-iq-local/render-sample.mts <out-dir> [frame.jpg]`.

Full local acceptance (real Azure Speech, Azure OpenAI, blob, DataForSEO, YouTube client in dry-run mode) on a video file on disk:
`cd apps/admin && bunx tsx scripts/video-iq-local/dry-run.mts <video.mp4> [result.txt]`. It reads keys from `apps/admin/.env`, `apps/web/.env` (speech), `.env.local` (YouTube token, DataForSEO) and `.oauth-client.local.json`, creates the content row `viq-dry-run`, runs all four stages, approves the default choice and publishes dry-run. Evidence from the first run: `docs/youtube/video-iq-acceptance-2026-10.md`.

## Quota

YouTube Data API: 10,000 units/day, reset 00:00 Pacific (12:30 IST). Every call is counted in `youtube_quota_days`; a write that would push the day past 9,000 is refused with HTTP 429 and the run stays `APPROVED` for retry tomorrow. A new upload costs ~1,850 units (insert 1,600 + thumbnail + 2 playlists + localisation + comment); a back-catalog update ~300. Quota extension form: https://support.google.com/youtube/contact/yt_api_form.

## Going live (done 2026-10-22)

Deployed to production in two steps: first with `VIDEO_IQ_YOUTUBE_DRY_RUN=1` (verified ffmpeg, PM2 `cron`, env, cron routes, trending poll), then with the repo variable set to `0`, so Publish now writes to the channel. To pause YouTube writes again: `gh variable set VIDEO_IQ_YOUTUBE_DRY_RUN --body 1` and redeploy (`gh workflow run deploy.yml`); Optimize keeps working either way. Evidence and the first real upload: `docs/youtube/video-iq-acceptance-2026-10.md`.

## Failure modes

| Symptom | Cause | What happens |
|---|---|---|
| `FAILED: no audio track in video` | screen recording / silent clip | permanent; re-upload with audio |
| `FAILED: video longer than 60 minutes` | spec limit | permanent |
| `FAILED: model output invalid …` | model broke the JSON contract | permanent for that run; Re-run |
| `captions not ready; retrying …` | back-catalog row, YouTube has not produced the Telugu track yet | stays `TRANSCRIBING`, retried every tick |
| `speech transcription failed: 4xx/5xx` | Azure Speech | retried up to 3 attempts, then `FAILED` |
| publish 429 | quota budget | row stays `APPROVED`; retry after 12:30 IST |
| publish warnings (thumbnail/playlists/localizations/comment) | optional step failed after the upload | row is `APPLIED` with warnings; the video exists; fix by hand in Studio or re-publish tomorrow |
| panel says keywords unavailable | DataForSEO not configured or IP not whitelisted | everything else works |

## Not in Phase A

Back-catalog sweep (4.8), 48 h / 7 d performance loop (12.2), captions upload (12.4), winnable-query finder (12.6), duplicate detection (12.7), topic playlists (12.8), canonical-name sweep (12.9), publish slots (12.10), weekly report. See spec section 10 for phasing.
