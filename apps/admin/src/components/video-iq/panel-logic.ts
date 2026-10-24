import type { Scores } from "@rayalaseema/youtube";
// Pure helpers behind the Video IQ panel, kept free of React so they can be
// unit-tested and re-used server side.
import type { Chosen } from "@/lib/video-iq/chosen";

export type Role = "ADMIN" | "EDITOR" | "SUB_EDITOR" | "REPORTER" | "USER";

export type Gate = { ok: boolean; reason?: string };

const EDITORS: Role[] = ["ADMIN", "EDITOR"];

export function defaultChosen(row: any): Chosen {
  if (row.chosen && typeof row.chosen === "object" && row.chosen.title) return row.chosen as Chosen;
  const s = row.suggestions;
  const thumbs: Array<{ renderedUrl: string | null }> = row.thumbnails ?? [];
  const ti = thumbs.findIndex((t) => t.renderedUrl);
  return {
    title: s.titles[0].text,
    thumbnailIndex: ti >= 0 ? ti : null,
    thumbnailUrl: ti >= 0 ? thumbs[ti].renderedUrl : null,
    description: s.description,
    tags: s.tags,
    chapters: s.chapters ?? [],
    hashtags: s.hashtags ?? [],
    playlists: (s.playlists ?? []).slice(0, 2),
    comment: s.pinned_comment ?? "",
  };
}

export function canApprove(row: any, role: string): Gate {
  if (!EDITORS.includes(role as Role)) return { ok: false, reason: "editor or admin only" };
  if (row.status !== "READY" && row.status !== "APPROVED") return { ok: false, reason: `run is ${row.status}` };
  if (!row.chosen?.title) return { ok: false, reason: "save a choice first" };
  return { ok: true };
}

export function canPublish(row: any, role: string, dirty = false): Gate {
  if (!EDITORS.includes(role as Role)) return { ok: false, reason: "editor or admin only" };
  if (dirty) return { ok: false, reason: "save your changes first; the saved choice is what gets published" };
  if (row.status !== "APPROVED") return { ok: false, reason: "approve first" };
  if (row.suggestions?.fit?.verdict === "not_fit" && !row.chosen?.override) {
    return { ok: false, reason: "not a fit for this channel; admin override needed" };
  }
  return { ok: true };
}

/** Units the publish will spend (documented YouTube costs, rounded to the 50s). */
export function quotaEstimate(row: any): number {
  const c = row.chosen ?? {};
  const base = row.source === "BLOB" ? 1600 : 50; // videos.insert vs videos.update
  const thumb = row.suggestions?.format === "SHORT" ? 0 : 50; // thumbnails.set
  const playlists = Math.min(2, (c.playlists ?? []).length) * 50; // playlistItems.insert each
  const localization = 50; // videos.update part=localizations
  const comment = c.comment?.trim() ? 50 : 0; // commentThreads.insert
  return base + thumb + playlists + localization + comment;
}

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ✨ Optimise: which fields the one-click pass should regenerate, in order.
// Fit is about the video itself and the thumbnail is a frame choice, so
// neither is on the list.
export type OptimiseField = "title" | "description" | "tags" | "comment" | "chapters";
export type Candidate = { value: any; score: number | null; reasons: string[]; why?: string };

export function optimisePlan(scores: Partial<Scores> | null | undefined, chosen: Pick<Chosen, "comment" | "chapters">): OptimiseField[] {
  const out: OptimiseField[] = [];
  for (const f of ["title", "description", "tags"] as const) if ((scores?.[f] ?? 0) < 100) out.push(f);
  if (!chosen.comment?.trim()) out.push("comment");
  if (!chosen.chapters?.length) out.push("chapters");
  return out;
}

/** The best candidate, only when it beats what the editor has; unscored fields take the first. */
export function pickBest(candidates: Candidate[], current: number | null): Candidate | null {
  if (!candidates.length) return null;
  if (current == null) return candidates[0];
  const scored = candidates.filter((c) => typeof c.score === "number").sort((a, b) => (b.score as number) - (a.score as number));
  return scored.length && (scored[0].score as number) > current ? scored[0] : null;
}
