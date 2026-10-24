// Per-field "regenerate with AI" for the workspace (owner ask 2026-10-24):
// the model sees the transcript, the current value, exactly why it scored
// what it scored, and the editor's instruction, and returns a better value.
// Output is cleaned (no URLs), validated and scored before it reaches the UI.
import { z } from "zod";
import { chatJsonWithRetry, type ChatMessage } from "@/lib/ai/client";
import {
  explainDescription, explainTags, explainTitle, joinTitle, scoreDescription, scoreTags, scoreTitle, splitTitle, titleLength, TITLE_MAX,
} from "@rayalaseema/youtube";
import { ownerPrompt } from "./prompt";

export type RegenField = "title" | "description" | "tags" | "comment" | "chapters" | "hashtags";
export type Candidate = { value: string | string[] | Array<{ start: string; title_te: string }>; score: number | null; reasons: string[]; why?: string };
export type RegenInput = { field: RegenField; run: any; current: unknown; instruction?: string };

export const VIDEOIQ_DEPLOYMENT = () => process.env.AZURE_OPENAI_VIDEOIQ_DEPLOYMENT || process.env.AZURE_OPENAI_COMPOSE_DEPLOYMENT || "gpt51";

const stripUrls = (s: string) => s.replace(/https?:\/\/\S+/gi, "").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const FIELD_RULES: Record<RegenField, string> = {
  title: 'Return {"titles":[{"text":"<Telugu hook> | <English headline>","why":"..."},{...},{...}]} with exactly 3 options. Each under 100 characters, Telugu hook first (standard Eenadu/Sakshi Telugu, no dialect), English headline after " | " carrying a person or place in canonical spelling and, where it fits, one of the priced search terms. No "బ్రేకింగ్" unless the item is breaking. No clock times.',
  description: 'Return {"description":"..."}: line 1 = a 1-line Telugu hook with the main keywords; then 3 to 6 standard-Telugu sentences telling the story from the transcript. No URLs, no hashtags, no sign-off (code adds the link and footer). Under 1,500 characters.',
  tags: 'Return {"tags":["..."]}: 20 to 25 tags mixing Telugu script and English, places and people first (canonical spellings), then topics; no duplicates, each under 60 characters.',
  comment: 'Return {"comment":"..."}: one engaging Telugu question about the story (under 300 characters), ending with a subscribe call-to-action. No URLs.',
  chapters: 'Return {"chapters":[{"start":"mm:ss","title_te":"..."}]}: 3 to 8 chapters from the transcript timestamps, first at 00:00, at least 10 seconds apart, short Telugu titles.',
  hashtags: 'Return {"hashtags":["#..."]}: 3 to 5 hashtags, place first, English or Telugu, no spaces.',
};

function context(run: any): string {
  const s = run.suggestions ?? {};
  const t = run.transcript;
  const lines = t?.segments?.length ? t.segments.map((x: any) => `[${mmss(x.start)}] ${x.text}`).join("\n").slice(0, 12_000) : "(no transcript)";
  const terms = (s.keywords?.terms ?? []).filter((k: any) => k.volume != null).map((k: any) => `${k.term} (${k.volume}/mo)`).join(", ");
  return [
    `DESK TITLE: ${run.deskTitle ?? ""}`,
    run.deskNotes ? `DESK NOTES: ${run.deskNotes}` : "",
    `DISTRICT: ${run.district ?? s.fit?.district ?? "unknown"} · BREAKING: ${run.breaking ? "yes" : "no"} · FORMAT: ${s.format ?? "VIDEO"}`,
    s.summary_te ? `SUMMARY: ${s.summary_te}` : "",
    s.entities ? `PEOPLE: ${(s.entities.people ?? []).join(", ")} · PLACES: ${(s.entities.places ?? []).join(", ")} · PARTIES: ${(s.entities.parties ?? []).join(", ")}` : "",
    terms ? `PRICED SEARCH TERMS: ${terms}` : "PRICED SEARCH TERMS: none available",
    `TRANSCRIPT:\n${lines}`,
  ].filter(Boolean).join("\n");
}

function reasonsFor(field: RegenField, run: any, current: unknown): string[] {
  const s = run.suggestions ?? {};
  const volumes = new Map<string, number | null>((s.keywords?.terms ?? []).map((k: any) => [k.term, k.volume]));
  const ctx = { entities: s.entities ?? { people: [], places: [], parties: [], topics: [] }, breaking: Boolean(run.breaking), volumes };
  if (field === "title" && typeof current === "string") return explainTitle(current, ctx);
  if (field === "description" && typeof current === "string") return explainDescription(current);
  if (field === "tags" && Array.isArray(current)) return explainTags(current as string[]);
  return [];
}

export function buildRegenerateMessages(i: RegenInput): ChatMessage[] {
  const reasons = reasonsFor(i.field, i.run, i.current);
  const currentText = Array.isArray(i.current) ? JSON.stringify(i.current) : String(i.current ?? "");
  const user = [
    `FIELD TO REWRITE: ${i.field}`,
    `CURRENT VALUE: ${stripUrls(currentText) || "(empty)"}`,
    reasons.length ? `WHY IT SCORED LOW: ${reasons.join("; ")}` : "CURRENT SCORE IS FINE; the editor wants a different take.",
    i.instruction ? `EDITOR INSTRUCTION (follow it): ${stripUrls(i.instruction)}` : "",
    FIELD_RULES[i.field],
    "",
    context(i.run),
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: `${ownerPrompt()}\nRewrite ONE field of the YouTube metadata. Standard Telugu only. Never write a URL. Return only the JSON object asked for.` },
    { role: "user", content: user },
  ];
}

const shapes = {
  title: z.object({ titles: z.array(z.object({ text: z.string(), why: z.string().optional() })).min(1) }),
  description: z.object({ description: z.string() }),
  tags: z.object({ tags: z.array(z.string()) }),
  comment: z.object({ comment: z.string() }),
  chapters: z.object({ chapters: z.array(z.object({ start: z.string(), title_te: z.string() })) }),
  hashtags: z.object({ hashtags: z.array(z.string()) }),
};

export async function regenerateField(i: RegenInput, deps: { chatJson?: typeof chatJsonWithRetry } = {}): Promise<{ candidates: Candidate[] }> {
  const chatJson = deps.chatJson ?? chatJsonWithRetry;
  const raw = await chatJson<unknown>({ deployment: VIDEOIQ_DEPLOYMENT(), messages: buildRegenerateMessages(i), temperature: null }, [1500, 3000]);
  const parsed = shapes[i.field].safeParse(raw);
  if (!parsed.success) throw new Error(`model output invalid: ${parsed.error.issues.slice(0, 2).map((e) => `${e.path.join(".")} ${e.message}`).join("; ")}`);
  const s = i.run.suggestions ?? {};
  const volumes = new Map<string, number | null>((s.keywords?.terms ?? []).map((k: any) => [k.term, k.volume]));
  const ctx = { entities: s.entities ?? { people: [], places: [], parties: [], topics: [] }, breaking: Boolean(i.run.breaking), volumes };

  switch (i.field) {
    case "title": {
      const seen = new Set<string>();
      const candidates: Candidate[] = [];
      for (const t of (parsed.data as z.infer<typeof shapes.title>).titles) {
        const text0 = stripUrls(t.text);
        if (titleLength(text0) < 5) continue;
        const { hook, english } = splitTitle(text0);
        const text = titleLength(text0) > TITLE_MAX ? joinTitle(hook, english) : text0;
        if (seen.has(text)) continue;
        seen.add(text);
        candidates.push({ value: text, score: scoreTitle(text, ctx), reasons: explainTitle(text, ctx), why: t.why });
      }
      return { candidates: candidates.slice(0, 3) };
    }
    case "description": {
      const lines = stripUrls((parsed.data as z.infer<typeof shapes.description>).description).split("\n").map((l) => l.trim());
      while (lines.length && !lines[0]) lines.shift();
      const value = lines.join("\n").replace(/\n{3,}/g, "\n\n").slice(0, 4500);
      return { candidates: [{ value, score: scoreDescription(value), reasons: explainDescription(value) }] };
    }
    case "tags": {
      const merged = [...((Array.isArray(i.current) ? (i.current as string[]) : [])), ...(parsed.data as z.infer<typeof shapes.tags>).tags];
      const seen = new Set<string>();
      const value: string[] = [];
      for (const raw of merged) {
        const t = stripUrls(raw).replace(/[,#]/g, "").trim().slice(0, 60);
        if (!t || seen.has(t.toLowerCase())) continue;
        seen.add(t.toLowerCase());
        value.push(t);
        if (value.length === 25) break; // rubric: 15 to 25 tags
      }
      return { candidates: [{ value, score: scoreTags(value), reasons: explainTags(value) }] };
    }
    case "comment": {
      const value = Array.from(stripUrls((parsed.data as z.infer<typeof shapes.comment>).comment)).slice(0, 500).join("").trim();
      return { candidates: [{ value, score: null, reasons: [] }] };
    }
    case "chapters": {
      const ch = (parsed.data as z.infer<typeof shapes.chapters>).chapters
        .map((c) => ({ start: c.start.trim(), title_te: stripUrls(c.title_te).slice(0, 80) }))
        .filter((c) => /^\d{2}:\d{2}(:\d{2})?$/.test(c.start) && c.title_te)
        .slice(0, 12);
      if (ch.length) ch[0] = { ...ch[0], start: "00:00" };
      return { candidates: [{ value: ch, score: null, reasons: [] }] };
    }
    case "hashtags": {
      const value = (parsed.data as z.infer<typeof shapes.hashtags>).hashtags.map((h) => "#" + stripUrls(h).replace(/^#+/, "").replace(/\s+/g, "")).filter((h) => h.length > 1).slice(0, 5);
      return { candidates: [{ value, score: null, reasons: [] }] };
    }
  }
}
