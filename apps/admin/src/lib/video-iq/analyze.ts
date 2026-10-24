// Transcript + desk copy → validated Suggestions via Azure OpenAI.
// The model never sees URLs and its output is checked against the zod
// contract before anything is stored.
import { chatJsonWithRetry, type ChatMessage } from "@/lib/ai/client";
import { joinTitle, splitTitle, suggestionsSchema, titleLength, TITLE_MAX, type Suggestions } from "@rayalaseema/youtube";
import type { Transcript } from "./transcribe";
import { ownerPrompt, RULES } from "./prompt";

export type AnalyzeInput = {
  format: "SHORT" | "VIDEO";
  transcript: Transcript | null;
  deskTitle: string;
  deskDescription: string;
  district?: string;
  keywordTerms: string[];
  playlists: string[];
  dateDdMmYyyy: string;
  breaking: boolean;
};

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const MIN_WORDS = 20;
const MAX_TRANSCRIPT_CHARS = 48_000;

export function buildMessages(i: AnalyzeInput): ChatMessage[] {
  const lines = i.transcript ? i.transcript.segments.map((s) => `[${mmss(s.start)}] ${s.text}`).join("\n") : "(no transcript)";
  const user = [
    `FORMAT: ${i.format}`,
    `DATE: ${i.dateDdMmYyyy}`,
    `BREAKING: ${i.breaking ? "yes" : "no"}`,
    `DISTRICT (desk): ${i.district ?? "unknown"}`,
    `DESK TITLE: ${i.deskTitle}`,
    `DESK DESCRIPTION: ${i.deskDescription.slice(0, 1500)}`,
    `KEYWORDS WITH DEMAND: ${i.keywordTerms.join(", ") || "(none)"}`,
    `PLAYLISTS (rank from these only): ${i.playlists.join(" | ") || "(none)"}`,
    `TRANSCRIPT (${i.transcript?.words ?? 0} words):`,
    lines.slice(0, MAX_TRANSCRIPT_CHARS),
  ].join("\n");
  return [
    { role: "system", content: `${ownerPrompt()}\n${RULES}` },
    { role: "user", content: user },
  ];
}

/**
 * Soft violations the model makes often (a title a few characters over 100,
 * 40 tags instead of 30) are fixed here instead of failing the run; anything
 * structural still fails validation below.
 */
export function repair(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...r };
  if (Array.isArray(r.titles)) {
    out.titles = r.titles.slice(0, 3).map((t: any) => {
      if (!t || typeof t.text !== "string") return t;
      if (titleLength(t.text) <= TITLE_MAX) return t;
      const { hook, english } = splitTitle(t.text);
      return { ...t, text: joinTitle(hook, english) };
    });
  }
  if (Array.isArray(r.tags)) out.tags = r.tags.filter((x: unknown) => typeof x === "string").map((x: string) => x.slice(0, 60)).slice(0, 30);
  if (Array.isArray(r.hashtags)) out.hashtags = r.hashtags.slice(0, 5);
  if (Array.isArray(r.chapters)) out.chapters = r.chapters.slice(0, 12);
  if (Array.isArray(r.playlists)) out.playlists = r.playlists.slice(0, 9);
  if (typeof r.description === "string") out.description = r.description.slice(0, 4500);
  if (typeof r.pinned_comment === "string") out.pinned_comment = r.pinned_comment.slice(0, 500);
  if (r.thumbnail && typeof r.thumbnail === "object") {
    const th = r.thumbnail as Record<string, unknown>;
    out.thumbnail = { ...th, headline_te: String(th.headline_te ?? "").slice(0, 60), concept: String(th.concept ?? "").slice(0, 300) };
  }
  return out;
}

export async function analyzeVideo(i: AnalyzeInput, deps: { chatJson?: typeof chatJsonWithRetry } = {}): Promise<Suggestions> {
  const chatJson = deps.chatJson ?? chatJsonWithRetry;
  const raw = await chatJson<unknown>(
    // temperature null: gpt-5.5 only accepts its default; the contract + repair keep output tight.
    { deployment: process.env.AZURE_OPENAI_VIDEOIQ_DEPLOYMENT || process.env.AZURE_OPENAI_COMPOSE_DEPLOYMENT || "gpt51", messages: buildMessages(i), temperature: null },
    // Telugu is token-heavy: a full contract (description, 20 tags, chapters,
    // summaries) overran 1,500 tokens on the first live run.
    [3000, 6000],
  );
  const parsed = suggestionsSchema.safeParse(repair(raw));
  if (!parsed.success) {
    const why = parsed.error.issues.slice(0, 3).map((e) => `${e.path.join(".")} ${e.message}`).join("; ");
    throw new Error(`model output invalid: ${why}`);
  }
  const thin = !i.transcript || (i.transcript.words ?? 0) < MIN_WORDS;
  // The probe decides the format (spec 12.1); the model only fills copy.
  return { ...parsed.data, format: i.format, low_confidence: parsed.data.low_confidence || thin };
}
