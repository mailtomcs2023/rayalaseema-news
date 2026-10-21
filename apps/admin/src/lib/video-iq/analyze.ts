// Transcript + desk copy → validated Suggestions via Azure OpenAI.
// The model never sees URLs and its output is checked against the zod
// contract before anything is stored.
import { chatJsonWithRetry, type ChatMessage } from "@/lib/ai/client";
import { suggestionsSchema, type Suggestions } from "@rayalaseema/youtube";
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

export async function analyzeVideo(i: AnalyzeInput, deps: { chatJson?: typeof chatJsonWithRetry } = {}): Promise<Suggestions> {
  const chatJson = deps.chatJson ?? chatJsonWithRetry;
  const raw = await chatJson<unknown>(
    { deployment: process.env.AZURE_OPENAI_COMPOSE_DEPLOYMENT || "gpt51", messages: buildMessages(i), temperature: 0.3 },
    // Telugu is token-heavy: a full contract (description, 20 tags, chapters,
    // summaries) overran 1,500 tokens on the first live run.
    [3000, 6000],
  );
  const parsed = suggestionsSchema.safeParse(raw);
  if (!parsed.success) {
    const why = parsed.error.issues.slice(0, 3).map((e) => `${e.path.join(".")} ${e.message}`).join("; ");
    throw new Error(`model output invalid: ${why}`);
  }
  const thin = !i.transcript || (i.transcript.words ?? 0) < MIN_WORDS;
  // The probe decides the format (spec 12.1); the model only fills copy.
  return { ...parsed.data, format: i.format, low_confidence: parsed.data.low_confidence || thin };
}
