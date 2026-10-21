// Helpers for the standalone YouTube flow (spec 2026-10-22): run creation
// input, visibility mapping, the article built from a published run, the
// "add website link" description edit, and the card summary for lists.
import { z } from "zod";
import { splitTitle, type VideoStatus } from "@rayalaseema/youtube";

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const MIN_LEAD_MS = 5 * 60_000;

export function youtubeIdFrom(input: string): string | null {
  const s = input.trim();
  if (YT_ID.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

export const runInputSchema = z
  .object({
    source: z.enum(["blob", "youtube"]),
    blobUrl: z.string().url().optional(),
    videoUrl: z.string().optional(),
    deskTitle: z.string().trim().max(120).default(""),
    deskNotes: z.string().trim().max(2000).optional(),
    breaking: z.boolean().default(false),
    district: z.string().trim().max(40).optional(),
    visibility: z.enum(["public", "private", "scheduled"]).default("public"),
    publishAt: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.source === "blob") {
      if (!v.blobUrl || !/\.blob\.core\.windows\.net\//.test(v.blobUrl)) ctx.addIssue({ code: "custom", path: ["blobUrl"], message: "upload the video first (blob storage url required)" });
      if (v.deskTitle.length < 3) ctx.addIssue({ code: "custom", path: ["deskTitle"], message: "desk title needed (3+ characters)" });
    } else if (!v.videoUrl || !youtubeIdFrom(v.videoUrl)) {
      ctx.addIssue({ code: "custom", path: ["videoUrl"], message: "paste a YouTube video url or id" });
    }
    if (v.visibility === "scheduled") {
      const t = v.publishAt ? Date.parse(v.publishAt) : NaN;
      if (!Number.isFinite(t) || t < Date.now() + MIN_LEAD_MS) ctx.addIssue({ code: "custom", path: ["publishAt"], message: "scheduled time must be at least 5 minutes in the future" });
    }
  });
export type RunInput = z.infer<typeof runInputSchema>;

export function visibilityToStatus(v: { visibility: string; publishAt?: Date | string | null }): VideoStatus {
  const scheduled = v.visibility === "scheduled" && v.publishAt;
  return {
    privacyStatus: v.visibility === "public" ? "public" : "private",
    ...(scheduled ? { publishAt: new Date(v.publishAt as Date | string).toISOString() } : {}),
    selfDeclaredMadeForKids: false,
    embeddable: true,
    license: "youtube",
  };
}

export type ArticleDraft = {
  title: string;
  summary: string | null;
  payload: { videoUrl: string; videoId: string; thumbnailUrl?: string; transcript?: string; duration?: number };
  editorNote: string;
  breaking: boolean;
};

/** The website article a published run turns into (DRAFT; the editor finishes it). */
export function articlePayloadFrom(run: any): ArticleDraft {
  const chosenTitle: string = run.chosen?.title ?? "";
  const hook = chosenTitle ? splitTitle(chosenTitle).hook : "";
  const transcript = run.transcript?.segments?.length
    ? Array.from(run.transcript.segments.map((s: { text: string }) => s.text).join(" ").replace(/\s+/g, " ").trim()).slice(0, 60_000).join("")
    : undefined;
  return {
    title: (hook || run.deskTitle || chosenTitle).slice(0, 200),
    summary: run.suggestions?.summary_te ?? null,
    payload: {
      videoUrl: `https://www.youtube.com/watch?v=${run.videoId}`,
      videoId: run.videoId,
      ...(run.chosen?.thumbnailUrl ? { thumbnailUrl: run.chosen.thumbnailUrl } : {}),
      ...(transcript ? { transcript } : {}),
      ...(typeof run.durationSec === "number" ? { duration: run.durationSec } : {}),
    },
    editorNote: `Created from YouTube run ${run.id}. Video is live on the channel; this page carries the transcript and the article link back to it.`,
    breaking: Boolean(run.breaking),
  };
}

/** Insert "పూర్తి వార్త: <url>" after the hook lines; null when the url is already there. */
export function descriptionWithArticleLink(current: string, url: string): string | null {
  if (current.includes(url)) return null;
  const lines = current.split("\n");
  const line = `పూర్తి వార్త: ${url}`;
  if (lines.length <= 2) return [...lines, line].join("\n");
  return [...lines.slice(0, 2), line, ...lines.slice(2)].join("\n");
}

export type RunCard = {
  id: string; status: string; title: string; deskTitle: string; score: number | null; thumb: string | null;
  videoId: string | null; warnings: number; createdBy: string; createdAt: string; contentId: string | null;
};

export function runSummary(row: any): RunCard {
  const thumbs: Array<{ renderedUrl: string | null }> = row.thumbnails ?? [];
  const frames: Array<{ url: string }> = row.frames ?? [];
  return {
    id: row.id,
    status: row.status,
    title: row.chosen?.title ?? row.suggestions?.titles?.[0]?.text ?? row.deskTitle ?? "",
    deskTitle: row.deskTitle ?? "",
    score: typeof row.scores?.overall === "number" ? row.scores.overall : null,
    thumb: row.chosen?.thumbnailUrl ?? thumbs.find((t) => t.renderedUrl)?.renderedUrl ?? frames[0]?.url ?? null,
    videoId: row.videoId ?? null,
    warnings: Array.isArray(row.applied?.warnings) ? row.applied.warnings.length : 0,
    createdBy: row.createdBy?.name ?? "",
    createdAt: new Date(row.createdAt).toISOString(),
    contentId: row.contentId ?? null,
  };
}
