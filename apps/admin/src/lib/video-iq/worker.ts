// Video IQ stage machine (spec 4.1 to 4.5). One call to runStage advances a
// VideoOptimization row exactly one stage and writes that stage's artifact:
//
//   QUEUED       → probe + 3 frames to blob            → EXTRACTING
//   EXTRACTING   → audio → Azure Speech transcript     → TRANSCRIBING
//   TRANSCRIBING → model suggestions + keywords + hook → ANALYZING
//   ANALYZING    → thumbnails + deterministic scores   → READY
//
// YOUTUBE-source rows skip extraction and wait for the caption track.
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

export type StoredSuggestions = Suggestions & { keywords: KeywordBlock; hook: HookCheck; probe: Probe | { durationSec: number; width?: number; height?: number } };

const MAX_ATTEMPTS = 3;
const MAX_DURATION_SEC = 3600;
const FRAME_POSITIONS = [0.1, 0.4, 0.7];
const PERMANENT = /no audio|longer than|model output invalid/;
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

async function stageTranscribing(row: any, d: Deps) {
  let transcript: Transcript | null = row.transcript;
  if (!transcript && row.source === "YOUTUBE") {
    transcript = await d.transcribe.transcriptFromCaptions(d.youtube, row.videoId);
    if (!transcript) {
      await set(d, row, { error: "captions not ready; retrying every 30 minutes", attempts: (row.attempts ?? 0) + 1 });
      return;
    }
    await set(d, row, { transcript });
  }
  const content = await d.prisma.content.findUnique({ where: { id: row.contentId }, include: { constituency: { include: { district: true } } } });
  if (!content) return fail(d, row, "content row missing");
  const probe = row.suggestions?.probe ?? { durationSec: transcript?.durationSec ?? 0 };
  const format = classifyFormat({ durationSec: probe.durationSec, width: probe.width, height: probe.height });
  const playlists = (await d.youtube.listMyPlaylists()).map((p) => p.title);
  const place = detectPlace(content.title);
  const district: string | undefined = content.constituency?.district?.nameEn ?? place?.district;
  const keywordTerms = [place ? `${place.en.toLowerCase()} news` : "", district ? `${district.toLowerCase()} news today` : ""].filter(Boolean);
  const suggestions = await d.analyze.analyzeVideo({
    format,
    transcript,
    deskTitle: content.title,
    deskDescription: content.summary || content.body || "",
    district,
    keywordTerms,
    playlists,
    dateDdMmYyyy: ddmmyyyy((d.now ?? (() => new Date()))()),
    breaking: Boolean(content.breaking),
  });
  const keywords = await d.keywords.enrichKeywords(suggestions, { prisma: d.prisma, dfs: d.dfs ?? null });
  const hook = hookCheck(transcript?.segments ?? [], format === "SHORT");
  // The probe decides the format (spec 12.1), never the model.
  const stored: StoredSuggestions = { ...suggestions, format, keywords, hook, probe };
  await set(d, row, { status: "ANALYZING", suggestions: stored, error: null });
}

async function stageAnalyzing(row: any, d: Deps) {
  const s: StoredSuggestions = row.suggestions;
  const frames: Array<{ t: number; url: string }> = row.frames ?? [];
  const thumbs: Array<{ headline: string; frameUrl: string; renderedUrl: string | null; bytes?: number }> = [];
  if (s.format !== "SHORT") {
    for (const f of frames) {
      try {
        const r = await d.thumbnail.renderThumbnail({ frame: f.url, headline: s.thumbnail.headline_te, breaking: false });
        const renderedUrl = await d.blob.uploadBuffer(Buffer.from(r.jpeg), "jpg", "image/jpeg");
        thumbs.push({ headline: s.thumbnail.headline_te, frameUrl: f.url, renderedUrl, bytes: r.jpeg.byteLength });
      } catch {
        thumbs.push({ headline: s.thumbnail.headline_te, frameUrl: f.url, renderedUrl: null });
      }
    }
  }
  const volumes = new Map<string, number | null>((s.keywords?.terms ?? []).map((k) => [k.term, k.volume]));
  const title = Math.max(...s.titles.map((t) => scoreTitle(t.text, { entities: s.entities, breaking: false, volumes })));
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

/** Advance up to `limit` rows one stage each. Rows touched in the last 90 s are skipped so two runners never overlap. */
export async function processQueue(d: Deps, limit = 3): Promise<{ processed: string[] }> {
  const rows = await d.prisma.videoOptimization.findMany({
    where: { status: { in: ACTIVE }, updatedAt: { lt: new Date(Date.now() - STALE_MS) } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const r of rows) await runStage(r, d);
  return { processed: rows.map((r: any) => r.id) };
}
