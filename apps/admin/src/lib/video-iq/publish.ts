// Publish an APPROVED run to YouTube (spec 4.7).
//
// BLOB source:    videos.insert (resumable) with the chosen snippet, then
//                 thumbnail, playlists, English localisation, comment.
// YOUTUBE source: videos.update on the existing id (snippet only unless the
//                 content is PUBLISHED/SCHEDULED, so a live video is never
//                 flipped private), then the same extras.
//
// The video id is saved the moment the insert returns, before any optional
// step, so a quota error half-way through can never cause a re-upload. Each
// extra step records a warning instead of failing the whole publish. Status
// ownership: this module alone moves the row between APPROVED, PUBLISHING,
// APPLIED and FAILED; the route only maps errors to HTTP.
import { YouTubeAuthError, YouTubeQuotaError, detectPlace, type VideoSnippet, type VideoStatus } from "@rayalaseema/youtube";
import { chosenSchema, finalizeChosen, SITE } from "./chosen";
import { QuotaBudgetError } from "./quota";
import { visibilityToStatus } from "./studio";

type PublishYouTube = {
  uploadVideo: (a: { bytes: Uint8Array; sizeBytes: number; snippet: VideoSnippet; status: VideoStatus }) => Promise<string>;
  updateSnippetStatus: (videoId: string, snippet: VideoSnippet, status?: VideoStatus, recordingDetails?: { locationDescription?: string }) => Promise<void>;
  setThumbnail: (videoId: string, jpeg: Uint8Array) => Promise<void>;
  listMyPlaylists: () => Promise<Array<{ id: string; title: string }>>;
  addToPlaylist: (playlistId: string, videoId: string) => Promise<void>;
  setLocalizations: (videoId: string, loc: Record<string, { title: string; description: string }>) => Promise<void>;
  insertComment: (videoId: string, text: string) => Promise<void>;
};

export type PublishDeps = {
  prisma: any;
  youtube: PublishYouTube;
  fetchBlob: (url: string) => Promise<{ bytes: Uint8Array; size: number }>;
  sitemapUrlFor: (videoId: string | null, slug: string | null) => Promise<string | null>;
  now?: () => Date;
};

export type PublishResult = { videoId: string; warnings: string[] };

/** Thrown before any state is written (wrong status, missing rows, bad choice). */
export class PublishPreconditionError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "PublishPreconditionError";
  }
}

/**
 * HTTP status for a publish failure and whether the run must stay APPROVED
 * (retryable) rather than be marked FAILED. Used by the route.
 */
export function classifyPublishError(e: unknown): { status: number; keepApproved: boolean } {
  if (e instanceof QuotaBudgetError || e instanceof YouTubeQuotaError) return { status: 429, keepApproved: true };
  if (e instanceof YouTubeAuthError) return { status: 503, keepApproved: true };
  if (e instanceof PublishPreconditionError || /not APPROVED|run not found|content row missing/.test(String((e as Error)?.message))) return { status: 409, keepApproved: true };
  if (/^fetch \d{3} /.test(String((e as Error)?.message))) return { status: 502, keepApproved: true };
  return { status: 500, keepApproved: false };
}

const TRANSCRIPT_MAX_CHARS = 60_000; // payload schema cap (packages/db/src/payload-schemas.ts)
const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export async function publishOptimization(id: string, d: PublishDeps): Promise<PublishResult> {
  const row = await d.prisma.videoOptimization.findUnique({ where: { id } });
  if (!row) throw new PublishPreconditionError("run not found");
  if (row.status !== "APPROVED") throw new PublishPreconditionError(`run is ${row.status}, not APPROVED`);
  // Standalone runs (no Content) carry their own visibility; linked runs
  // (old panel path) keep their Content for the article link only.
  const content = row.contentId ? await d.prisma.content.findUnique({ where: { id: row.contentId } }) : null;
  if (row.contentId && !content) throw new PublishPreconditionError("content row missing");
  const parsed = chosenSchema.safeParse(row.chosen);
  if (!parsed.success) throw new PublishPreconditionError("choose a title, thumbnail and SEO first");

  const chosen0 = parsed.data;
  const place = detectPlace(chosen0.title);
  const articleUrl = content
    ? (await d.sitemapUrlFor(row.videoId, content.slug)) ?? (content.slug && content.status === "PUBLISHED" ? `${SITE}/videos/${content.slug}` : null)
    : null;
  const chosen = finalizeChosen(row, chosen0, { url: articleUrl, place, today: row.source === "BLOB" });

  const snippet: VideoSnippet = {
    title: chosen.title,
    description: chosen.description,
    tags: chosen.tags,
    categoryId: "25",
    defaultLanguage: "te",
    defaultAudioLanguage: "te",
  };
  // Visibility: a standalone run says it itself; a run made from the old
  // Content panel follows the article's status (SCHEDULED → private + publishAt,
  // PUBLISHED → public, anything else → private).
  const visibility: string = row.visibility ?? "public";
  const contentScheduled = Boolean(content && content.status === "SCHEDULED" && content.scheduledAt);
  const status: VideoStatus = content && visibility === "public" && content.status !== "PUBLISHED"
    ? {
        privacyStatus: "private",
        ...(contentScheduled ? { publishAt: new Date(content.scheduledAt).toISOString() } : {}),
        selfDeclaredMadeForKids: false,
        embeddable: true,
        license: "youtube",
      }
    : visibilityToStatus({ visibility, publishAt: row.publishAt });
  const live = status.privacyStatus === "public" || Boolean(status.publishAt);

  const now = (d.now ?? (() => new Date()))();
  const warnings: string[] = [];
  const applied: Record<string, unknown> = { at: now.toISOString(), title: chosen.title };
  await d.prisma.videoOptimization.update({ where: { id }, data: { status: "PUBLISHING", error: null } });

  let videoId: string;
  try {
    if (row.source === "BLOB") {
      const file = await d.fetchBlob(row.blobUrl);
      videoId = await d.youtube.uploadVideo({ bytes: file.bytes, sizeBytes: file.size, snippet, status });
      // Saved before anything else can fail: a retry must never re-upload.
      await d.prisma.videoOptimization.update({ where: { id }, data: { videoId } });
      applied.inserted = true;
    } else {
      videoId = row.videoId;
      // Only touch privacy when the content itself is live or scheduled;
      // otherwise a metadata refresh of a public video would hide it.
      await d.youtube.updateSnippetStatus(videoId, snippet, live ? status : undefined, place ? { locationDescription: place.en } : undefined);
      applied.updated = true;
    }
  } catch (e) {
    await d.prisma.videoOptimization.update({ where: { id }, data: { status: "APPROVED", error: (e as Error).message.slice(0, 2000) } });
    throw e;
  }

  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
      if (applied[label] === undefined) applied[label] = true; // a step may record its own note (e.g. "skipped")
    } catch (e) {
      const why = e instanceof YouTubeQuotaError ? "quota exhausted, retry tomorrow" : (e as Error).message.slice(0, 200);
      warnings.push(`${label}: ${why}`);
    }
  };
  await step("thumbnail", async () => {
    if (row.suggestions?.format === "SHORT" || !chosen.thumbnailUrl) return;
    const t = await d.fetchBlob(chosen.thumbnailUrl);
    await d.youtube.setThumbnail(videoId, t.bytes);
  });
  await step("playlists", async () => {
    if (!chosen.playlists.length) return;
    const mine = await d.youtube.listMyPlaylists();
    for (const name of chosen.playlists.slice(0, 2)) {
      const pl = mine.find((p) => p.title === name);
      if (pl) await d.youtube.addToPlaylist(pl.id, videoId);
      else warnings.push(`playlists: "${name}" not found on the channel`);
    }
  });
  await step("localizations", async () => {
    const en = [row.suggestions?.summary_en, `🌐 ${SITE}`].filter(Boolean).join("\n");
    await d.youtube.setLocalizations(videoId, { en: { title: chosen.title, description: en } });
  });
  await step("comment", async () => {
    if (!chosen.comment.trim()) return;
    // YouTube refuses comments on private videos (403); scheduled uploads
    // are private until publishAt, so the comment is left for a re-publish.
    if (status.privacyStatus === "private" && (row.source === "BLOB" || live)) {
      applied.comment = "skipped: private video";
      return;
    }
    await d.youtube.insertComment(videoId, chosen.comment.trim());
  });

  try {
    // A linked website article gets the YouTube id, thumbnail and transcript;
    // a standalone run has nothing to update until "Create website article".
    if (content) {
      const prev = (content.payload ?? {}) as Record<string, unknown>;
      const spoken: string | undefined = row.transcript?.segments?.length
        ? row.transcript.segments.map((s: { text: string }) => s.text).join(" ").replace(/\s+/g, " ").trim()
        : (prev.transcript as string | undefined);
      const transcript = spoken ? Array.from(spoken).slice(0, TRANSCRIPT_MAX_CHARS).join("") : undefined;
      const payload: Record<string, unknown> = {
        ...prev,
        videoId,
        ...(row.source === "BLOB" ? { videoUrl: watchUrl(videoId) } : {}),
        ...(chosen.thumbnailUrl ? { thumbnailUrl: chosen.thumbnailUrl } : {}),
        ...(transcript ? { transcript } : {}),
      };
      await d.prisma.content.update({ where: { id: row.contentId }, data: { payload } });
      await d.prisma.socialPost.upsert({
        where: { contentId_platform: { contentId: row.contentId, platform: "YOUTUBE" } },
        create: { contentId: row.contentId, platform: "YOUTUBE", status: "POSTED", postUrl: watchUrl(videoId), postedAt: now },
        update: { status: "POSTED", postUrl: watchUrl(videoId), postedAt: now, error: null },
      });
    }
    await d.prisma.videoOptimization.update({
      where: { id },
      data: { status: "APPLIED", videoId, applied: { ...applied, warnings }, error: warnings.length ? warnings.join(" | ") : null },
    });
  } catch (e) {
    // The video exists on YouTube; record that so nobody re-uploads it.
    await d.prisma.videoOptimization.update({ where: { id }, data: { status: "FAILED", videoId, applied: { ...applied, warnings }, error: `after upload: ${(e as Error).message.slice(0, 1900)}` } }).catch(() => {});
    throw e;
  }
  return { videoId, warnings };
}
