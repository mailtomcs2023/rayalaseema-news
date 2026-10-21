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

async function fail(d: Deps, row: any, error: string) {
  await set(d, row, { status: "FAILED", error: error.slice(0, 2000), attempts: (row.attempts ?? 0) + 1 });
}

async function stageQueued(row: any, d: Deps) {
  if (row.source === "YOUTUBE") {
    // Back-catalog rows: YouTube already has the frames; wait for captions.
    await set(d, row, { status: "TRANSCRIBING", frames: [{ t: 0, url: `https://i.ytimg.com/vi/${row.videoId}/maxresdefault.jpg` }], error: null });
    return;
  }
  const probe = await d.media.probe(row.blobUrl);
  if (probe.durationSec > MAX_DURATION_SEC) return fail(d, row, "video longer than 60 minutes");
  const times = FRAME_POSITIONS.map((f) => Math.max(0.5, probe.durationSec * f));
  const frames = await d.media.extractFrames(row.blobUrl, times);
  const urls: Array<{ t: number; url: string }> = [];
  for (let i = 0; i < frames.length; i++) {
    urls.push({ t: times[i], url: await d.blob.uploadBuffer(Buffer.from(frames[i]), "jpg", "image/jpeg") });
  }
  await set(d, row, { status: "EXTRACTING", frames: urls, suggestions: { probe }, error: null });
}

async function stageExtracting(row: any, d: Deps) {
  const mp3 = await d.media.extractAudioMp3(row.blobUrl);
  const transcript = await d.transcribe.transcribeAudio(mp3, { phrases: PHRASES });
  await set(d, row, { status: "TRANSCRIBING", transcript, error: null });
}

/** Returns false when the row should wait for captions (nothing else to do this tick). */
async function captionsReadyOrGivenUp(row: any, d: Deps, now: Date): Promise<boolean> {
  if (row.transcript || row.source !== "YOUTUBE") return true;
  const attempts = row.attempts ?? 0;
  if (attempts >= CAPTION_MAX_ATTEMPTS) return true; // give up on captions, analyse desk text
  if (attempts > 0 && now.getTime() - new Date(row.updatedAt).getTime() < CAPTION_RETRY_MS) return false;
  const transcript = await d.transcribe.transcriptFromCaptions(d.youtube, row.videoId);
  if (!transcript) {
    await set(d, row, { error: `captions not ready; poll ${attempts + 1}/${CAPTION_MAX_ATTEMPTS}, next in 30 minutes`, attempts: attempts + 1 });
    return false;
  }
  await set(d, row, { transcript, error: null });
  return true;
}

async function stageTranscribing(row: any, d: Deps) {
  const now = (d.now ?? (() => new Date()))();
  if (!(await captionsReadyOrGivenUp(row, d, now))) return;
  const transcript: Transcript | null = row.transcript ?? null;
  const content = await d.prisma.content.findUnique({ where: { id: row.contentId }, include: { constituency: { include: { district: true } } } });
  if (!content) return fail(d, row, "content row missing");
  const probe = row.suggestions?.probe ?? { durationSec: transcript?.durationSec ?? 0 };
  const format = classifyFormat({ durationSec: probe.durationSec, width: probe.width, height: probe.height });
  const playlists = (await d.youtube.listMyPlaylists()).map((p) => p.title);
  const place = detectPlace(content.title);
  const district: string | undefined = content.constituency?.district?.nameEn ?? place?.district;
  const keywordTerms = [place ? `${place.en.toLowerCase()} news` : "", district ? `${district.toLowerCase()} news today` : ""].filter(Boolean);
  const breaking = Boolean(content.breaking);
  const suggestions = await d.analyze.analyzeVideo({
    format,
    transcript,
    deskTitle: content.title,
    deskDescription: content.summary || content.body || "",
    district,
    keywordTerms,
    playlists,
    dateDdMmYyyy: ddmmyyyy(now),
    breaking,
  });
  const keywords = await d.keywords.enrichKeywords(suggestions, { prisma: d.prisma, dfs: d.dfs ?? null });
  const hook = hookCheck(transcript?.segments ?? [], format === "SHORT");
  // The probe decides the format (spec 12.1), never the model.
  const thin = !transcript || (transcript.words ?? 0) < 20;
  const stored: StoredSuggestions = { ...suggestions, format, keywords, hook, probe, breaking, low_confidence: suggestions.low_confidence || thin };
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
  await set(d, row, { status: "READY", thumbnails: thumbs, scores: { ...scores, overall: overall(scores) }, error: null });
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

const ACTIVE = ["QUEUED", "EXTRACTING", "TRANSCRIBING", "ANALYZING"];
const STALE_MS = 90_000;

/**
 * Advance up to `limit` rows one stage each. A row is claimed by bumping its
 * updatedAt in a conditional update, so two runners (the PM2 scheduler and a
 * manual curl, or an overlapping tick) can never process the same row twice.
 */
export async function processQueue(d: Deps, limit = 3): Promise<{ processed: string[] }> {
  const stale = new Date(Date.now() - STALE_MS);
  const candidates = await d.prisma.videoOptimization.findMany({
    where: { status: { in: ACTIVE }, updatedAt: { lt: stale } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const processed: string[] = [];
  for (const r of candidates) {
    const claim = await d.prisma.videoOptimization.updateMany({ where: { id: r.id, updatedAt: { lt: stale } }, data: { updatedAt: new Date() } });
    if (claim.count !== 1) continue; // someone else took it
    await runStage(r, d);
    processed.push(r.id);
  }
  return { processed };
}
