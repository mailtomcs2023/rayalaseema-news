// Shared shapes for the Json columns on VideoOptimization. Kept here so the
// worker, the routes and the panel agree on what each column holds.
export type { Probe } from "./media";
export type { HookCheck } from "@rayalaseema/youtube";

export type FrameRef = { t: number; url: string };
export type ThumbnailRef = { headline: string; frameUrl: string; renderedUrl: string | null; bytes?: number };
export type Scores = { title: number; thumbnail: number; description: number; tags: number; fit: number; overall: number };
export type VideoIqStatus = "QUEUED" | "EXTRACTING" | "TRANSCRIBING" | "ANALYZING" | "READY" | "APPROVED" | "PUBLISHING" | "APPLIED" | "FAILED";
