// Video IQ stage machine (spec 4.1 to 4.5). One call to runStage advances a
// VideoOptimization row exactly one stage and writes that stage's artifact:
//
//   QUEUED       → probe + 3 frames to blob            → EXTRACTING
//   EXTRACTING   → audio → Azure Speech transcript     → TRANSCRIBING
//   TRANSCRIBING → model suggestions + keywords + hook → ANALYZING
//   ANALYZING    → thumbnails + deterministic scores   → READY
//
// YOUTUBE-source rows skip extraction and wait for the caption track, polled
// at most every 30 minutes and at most 48 times (spec 4.2); after that the
// analysis runs on desk text alone (low confidence).
// Dependencies are injected so the stages run against fakes in tests.
import {
  classifyFormat, detectPlace, hookCheck, overall, scoreDescription, scoreFit, scoreTags, scoreThumbnail, scoreTitle,
  PEOPLE, PLACES, type Suggestions,
} from "@rayalaseema/youtube";
import type { Transcript } from "./transcribe";
import type { KeywordBlock } from "./keywords";
import type { HookCheck, Probe } from "./types";

export type Deps = {
  prisma: any;
  media: Pick<typeof import("./media"), "probe" | "extractAudioMp3" | "extractFrames">;
  transcribe: Pick<typeof import("./transcribe"), "transcribeAudio" | "transcriptFromCaptions">;
  analyze: Pick<typeof import("./analyze"), "analyzeVideo">;
  keywords: Pick<typeof import("./keywords"), "enrichKeywords">;
  thumbnail: Pick<typeof import("./thumbnail"), "renderThumbnail">;
  youtube: { listMyPlaylists: () => Promise<Array<{ id: string; title: string }>>; listCaptions: (id: string) => Promise<any[]>; downloadCaption: (id: string) => Promise<string> };
  blob: { uploadBuffer: (b: Buffer, ext: string, contentType: string) => Promise<string> };
  dfs?: any;
  now?: () => Date;
};

export type StoredSuggestions = Suggestions & {
  keywords: KeywordBlock;
  hook: HookCheck;
  probe: Probe | { durationSec: number; width?: number; height?: number };
  /** Desk's breaking flag at analysis time; drives the thumbnail badge and the title score. */
  breaking: boolean;
};

const MAX_ATTEMPTS = 3;
const MAX_DURATION_SEC = 3600;
const FRAME_POSITIONS = [0.1, 0.4, 0.7];
// Permanent failures never retry. A contract violation by the model is NOT
// permanent: the model is sampled, so the next attempt usually passes.
const PERMANENT = /no audio|longer than|content row missing/;
export const CAPTION_RETRY_MS = 30 * 60_000;
export const CAPTION_MAX_ATTEMPTS = 48; // 24 hours at one poll per 30 minutes
const PHRASES = [
  ...PLACES.map((p) => p.te),
  ...PEOPLE.map((p) => p.te),
  ...PEOPLE.flatMap((p) => p.aliases.filter((a) => /[ఀ-౿]/.test(a))),
];

const ddmmyyyy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

async function set(d: Deps, row: any, data: Record<string, unknown>) {
  Object.assign(row, data);
  await d.prisma.videoOptimization.update({ where: { id: row.id }, data });
}

export type RunEvent = { at: string; text: string };
const MAX_EVENTS = 60;

/** Append a line to the run's live activity feed (what the workspace shows while working). */
async function note(d: Deps, row: any, text: string, extra: Record<string, unknown> = {}) {
  const at = (d.now ?? (() => new Date()))().toISOString();
  const events: RunEvent[] = [...((row.events as RunEvent[] | null) ?? []), { at, text }].slice(-MAX_EVENTS);
  await set(d, row, { events, ...extra });
}

async function fail(d: Deps, row: any, error: string) {
  await note(d, row, `Failed: ${error.slice(0, 160)}`, { status: "FAILED", error: error.slice(0, 2000), attempts: (row.attempts ?? 0) + 1 });
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function stageQueued(row: any, d: Deps) {
  if (row.source === "YOUTUBE") {
    // Back-catalog rows: YouTube already has the frames; wait for captions.
    await note(d, row, "Existing channel video: using YouTube's own frames; checking for the Telugu caption track", {
      status: "TRANSCRIBING", frames: [{ t: 0, url: `https://i.ytimg.com/vi/${row.videoId}/maxresdefault.jpg` }], error: null,
    });
    return;
  }
  await note(d, row, "Downloading the video and reading it with ffmpeg");
  const probe = await d.media.probe(row.blobUrl);
  if (probe.durationSec > MAX_DURATION_SEC) return fail(d, row, "video longer than 60 minutes");
  const format = classifyFormat({ durationSec: probe.durationSec, width: probe.width, height: probe.height });
  await note(d, row, `Video is ${mmss(probe.durationSec)}, ${probe.width}×${probe.height}${probe.hasAudio ? ", with audio" : ", NO AUDIO"} → ${format === "SHORT" ? "a Short" : "a long-form video"}`);
  const times = FRAME_POSITIONS.map((f) => Math.max(0.5, probe.durationSec * f));
  const frames = await d.media.extractFrames(row.blobUrl, times);
  const urls: Array<{ t: number; url: string }> = [];
  for (let i = 0; i < frames.length; i++) {
    urls.push({ t: times[i], url: await d.blob.uploadBuffer(Buffer.from(frames[i]), "jpg", "image/jpeg") });
  }
  await note(d, row, `Cut ${frames.length} frames at ${times.map(mmss).join(", ")} for the thumbnails`, {
    status: "EXTRACTING", frames: urls, suggestions: { probe }, durationSec: Math.round(probe.durationSec), error: null,
  });
}

async function stageExtracting(row: any, d: Deps) {
  const mp3 = await d.media.extractAudioMp3(row.blobUrl);
  await note(d, row, `Audio extracted (${kb(mp3.byteLength)} mono mp3); sending to Azure Speech, Telugu`);
  const transcript = await d.transcribe.transcribeAudio(mp3, { phrases: PHRASES });
  await note(d, row, `Transcript ready: ${transcript.words ?? 0} words in ${transcript.segments.length} segments`, { status: "TRANSCRIBING", transcript, error: null });
}

/** Returns false when the row should wait for captions (nothing else to do this tick). */
async function captionsReadyOrGivenUp(row: any, d: Deps, now: Date): Promise<boolean> {
  if (row.transcript || row.source !== "YOUTUBE") return true;
  const attempts = row.attempts ?? 0;
  const skip = Boolean(row.suggestions?.skipCaptions);
  if (attempts >= CAPTION_MAX_ATTEMPTS || skip) {
    if (!row.suggestions?.captionsGivenUp) await note(d, row, skip ? "Analysing from the title now, without a transcript (as asked)" : "No caption track after 24 hours; analysing from the title", { suggestions: { ...(row.suggestions ?? {}), captionsGivenUp: true } });
    return true;
  }
  // Spacing is measured from the last real poll, never from updatedAt (which
  // every worker claim bumps).
  if (row.lastPollAt && now.getTime() - new Date(row.lastPollAt).getTime() < CAPTION_RETRY_MS) return false;
  const transcript = await d.transcribe.transcriptFromCaptions(d.youtube, row.videoId);
  if (!transcript) {
    await note(d, row, `YouTube has no Telugu caption track yet (poll ${attempts + 1} of ${CAPTION_MAX_ATTEMPTS}); next check in 30 minutes. Use "Analyse now" to continue from the title.`, {
      error: `captions not ready; poll ${attempts + 1}/${CAPTION_MAX_ATTEMPTS}, next in 30 minutes`, attempts: attempts + 1, lastPollAt: now,
    });
    return false;
  }
  await note(d, row, `Caption track found: ${transcript.words ?? 0} words`, { transcript, error: null, lastPollAt: now });
  return true;
}

async function stageTranscribing(row: any, d: Deps) {
  const now = (d.now ?? (() => new Date()))();
  if (!(await captionsReadyOrGivenUp(row, d, now))) return;
  const transcript: Transcript | null = row.transcript ?? null;
  // Desk context: the run's own fields (standalone upload); a linked Content
  // row (old panel path) fills whatever the run left empty; a back-catalog
  // run without a desk title takes the catalog title.
  const content = row.contentId
    ? await d.prisma.content.findUnique({ where: { id: row.contentId }, include: { constituency: { include: { district: true } } } })
    : null;
  if (row.contentId && !content) return fail(d, row, "content row missing");
  if (!row.deskTitle && row.videoId && d.prisma.channelVideo) {
    const cv = await d.prisma.channelVideo.findUnique({ where: { videoId: row.videoId }, select: { title: true } }).catch(() => null);
    if (cv?.title) await set(d, row, { deskTitle: cv.title });
  }
  const deskTitle: string = row.deskTitle || content?.title || "";
  const deskDescription: string = row.deskNotes || content?.summary || content?.body || "";
  const probe = row.suggestions?.probe ?? { durationSec: transcript?.durationSec ?? 0 };
  const format = classifyFormat({ durationSec: probe.durationSec, width: probe.width, height: probe.height });
  const playlists = (await d.youtube.listMyPlaylists()).map((p) => p.title);
  const place = detectPlace(deskTitle);
  const district: string | undefined = row.district || content?.constituency?.district?.nameEn || place?.district;
  const keywordTerms = [place ? `${place.en.toLowerCase()} news` : "", district ? `${district.toLowerCase()} news today` : ""].filter(Boolean);
  const breaking = Boolean(row.breaking || content?.breaking);
  const suggestions = await d.analyze.analyzeVideo({
    format,
    transcript,
    deskTitle,
    deskDescription,
    district,
    keywordTerms,
    playlists,
    dateDdMmYyyy: ddmmyyyy(now),
    breaking,
  });
  await note(d, row, `Model proposed ${suggestions.titles.length} titles, ${suggestions.tags.length} tags, ${suggestions.chapters.length} chapters; channel fit: ${suggestions.fit.verdict}`);
  const keywords = await d.keywords.enrichKeywords(suggestions, { prisma: d.prisma, dfs: d.dfs ?? null });
  await note(d, row, keywords.unavailable ? `Keywords unavailable: ${keywords.unavailable}` : `Keywords: ${keywords.terms.filter((t) => t.volume != null).length} terms priced, ${keywords.suggested.length} ideas, ${keywords.serp.length} ranking videos checked`);
  const hook = hookCheck(transcript?.segments ?? [], format === "SHORT");
  if (hook.late) await note(d, row, `Hook check: the news starts at ${mmss(hook.startsAt)} (${hook.reason})`);
  // The probe decides the format (spec 12.1), never the model.
  const thin = !transcript || (transcript.words ?? 0) < 20;
  const stored: StoredSuggestions = { ...(row.suggestions ?? {}), ...suggestions, format, keywords, hook, probe, breaking, low_confidence: suggestions.low_confidence || thin };
  await set(d, row, { status: "ANALYZING", suggestions: stored, error: null });
}

async function stageAnalyzing(row: any, d: Deps) {
  const s: StoredSuggestions = row.suggestions;
  const breaking = Boolean(s.breaking);
  const frames: Array<{ t: number; url: string }> = row.frames ?? [];
  const thumbs: Array<{ headline: string; frameUrl: string; renderedUrl: string | null; bytes?: number; error?: string }> = [];
  if (s.format !== "SHORT") {
    for (const f of frames) {
      try {
        const r = await d.thumbnail.renderThumbnail({ frame: f.url, headline: s.thumbnail.headline_te, breaking });
        const renderedUrl = await d.blob.uploadBuffer(Buffer.from(r.jpeg), "jpg", "image/jpeg");
        thumbs.push({ headline: s.thumbnail.headline_te, frameUrl: f.url, renderedUrl, bytes: r.jpeg.byteLength });
      } catch (e) {
        const error = (e as Error).message.slice(0, 200);
        console.error(`[video-iq] thumbnail render failed for ${row.id}: ${error}`);
        thumbs.push({ headline: s.thumbnail.headline_te, frameUrl: f.url, renderedUrl: null, error });
      }
    }
  }
  const volumes = new Map<string, number | null>((s.keywords?.terms ?? []).map((k) => [k.term, k.volume]));
  const title = Math.max(...s.titles.map((t) => scoreTitle(t.text, { entities: s.entities, breaking, volumes })));
  const thumbnail = s.format === "SHORT"
    ? 100
    : scoreThumbnail({ headline: s.thumbnail.headline_te, hasFrame: thumbs.some((x) => x.renderedUrl), bytes: thumbs[0]?.bytes, width: 1280, height: 720 });
  const scores = { title, thumbnail, description: scoreDescription(s.description), tags: scoreTags(s.tags), fit: scoreFit(s.fit) };
  const all = { ...scores, overall: overall(scores) };
  await note(d, row, s.format === "SHORT" ? "Short: no thumbnails needed" : `${thumbs.filter((t) => t.renderedUrl).length} branded thumbnails rendered`);
  await note(d, row, `Ready. Scores: title ${all.title}, thumbnail ${all.thumbnail}, description ${all.description}, tags ${all.tags}, fit ${all.fit} → overall ${all.overall}`, {
    status: "READY", thumbnails: thumbs, scores: all, error: null,
  });
}

export async function runStage(row: any, d: Deps): Promise<void> {
  try {
    switch (row.status) {
      case "QUEUED": return await stageQueued(row, d);
      case "EXTRACTING": return await stageExtracting(row, d);
      case "TRANSCRIBING": return await stageTranscribing(row, d);
      case "ANALYZING": return await stageAnalyzing(row, d);
      default: return;
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    const attempts = (row.attempts ?? 0) + 1;
    if (attempts >= MAX_ATTEMPTS || PERMANENT.test(msg)) await fail(d, row, msg);
    else await set(d, row, { error: msg.slice(0, 2000), attempts });
  }
}

export const ACTIVE_STATUSES = ["QUEUED", "EXTRACTING", "TRANSCRIBING", "ANALYZING"] as const;
const STALE_MS = 90_000;
const RUN_BUDGET_MS = 240_000; // the cron route allows 300 s; leave headroom for the last stage
const MAX_STAGES_PER_CALL = 5;

/** The in-flight run for a content row, if any (used to refuse a duplicate Optimize). */
export async function activeRunExists(prisma: any, contentId: string): Promise<{ id: string; status: string } | null> {
  const row = await prisma.videoOptimization.findFirst({ where: { contentId, status: { in: [...ACTIVE_STATUSES] } }, select: { id: true, status: true } });
  return row ?? null;
}

/**
 * Advance up to `limit` rows. A row is claimed by bumping its updatedAt in a
 * conditional update, so two runners (the PM2 scheduler and a manual curl, or
 * an overlapping tick) can never process the same row twice. A claimed row is
 * then carried through consecutive stages in this same call (a whole run
 * normally finishes in one tick) and released as soon as a stage makes no
 * progress: waiting for captions, or a retryable error.
 */
export async function processQueue(d: Deps, limit = 3): Promise<{ processed: string[] }> {
  const stale = new Date(Date.now() - STALE_MS);
  // Fresh QUEUED rows are eligible at once (a run should start seconds after
  // Start); rows mid-flight are only retaken after the 90 s window.
  const candidates = await d.prisma.videoOptimization.findMany({
    where: { status: { in: [...ACTIVE_STATUSES] }, OR: [{ updatedAt: { lt: stale } }, { status: "QUEUED", attempts: 0 }] },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const processed: string[] = [];
  const started = Date.now();
  for (const r of candidates) {
    // Exact-match on the updatedAt we read: only one runner can win the claim.
    const claim = await d.prisma.videoOptimization.updateMany({ where: { id: r.id, updatedAt: r.updatedAt }, data: { updatedAt: new Date() } });
    if (claim.count !== 1) continue; // someone else took it
    for (let stages = 0; stages < MAX_STAGES_PER_CALL && (ACTIVE_STATUSES as readonly string[]).includes(r.status); stages++) {
      if (stages > 0 && Date.now() - started > RUN_BUDGET_MS) break;
      const before = r.status;
      await runStage(r, d);
      if (r.status === before) break; // no progress this stage: waiting or retrying later
    }
    processed.push(r.id);
  }
  return { processed };
}
