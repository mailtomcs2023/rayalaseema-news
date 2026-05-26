// Step 1 of the Telugu newsroom pipeline. Mechanical: take English (or any
// language) source text + return structured JSON capturing the 5W, every
// quote with its speaker + verb-of-saying, every number, every named person
// / place / org. Composes pass uses this JSON — never the raw source — so
// it can't accidentally drag in untranslated English or hallucinate names.
//
// Model: GPT-4.1-mini (deployment "gpt41-mini"). Cheap + fast + accurate
// enough for extraction (no Telugu output needed at this step).
import { chat, parseJsonEnvelope } from "./client";

export interface ExtractedQuote {
  speaker: string;
  designation: string;
  verb_of_saying: string;   // "said" / "stated" / "announced" / etc.
  original_text: string;    // the actual quoted text in the source
}

export interface ExtractedFacts {
  headline_en: string;
  dek_en: string;
  lead_paragraph_en: string;
  who: Array<{ name: string; designation: string; role: string }>;
  what: string;
  when: string;               // ISO date / time if available, else descriptive
  where: Array<{ place: string; type: "city" | "state" | "country" | "venue" }>;
  why: string;
  how: string;
  quotes: ExtractedQuote[];   // EMPTY array if the source has no direct quotes
  numbers: Array<{ value: string; unit: string; context: string }>;
  key_facts: string[];
  sub_headings: string[];     // suggested H3 boundaries; may be empty
  source_paragraphs: string[]; // 1-2 sentence chunks from source, for fact-check reference
}

const EXTRACT_SYSTEM = `You are a news extraction engine. Given an English news article, return a STRICT JSON envelope capturing facts ONLY — no opinions, no rephrasing, no editorializing.

OUTPUT SHAPE (always exactly this — empty arrays / strings when source lacks the info):
{
  "headline_en": "<original or your best one-line summary, 7-12 words>",
  "dek_en": "<2-line standfirst summarizing the news>",
  "lead_paragraph_en": "<30-40 word 5W lead from the source>",
  "who": [{ "name": "<exact name from source>", "designation": "<title>", "role": "<spokesperson | victim | official | analyst>" }],
  "what": "<one-sentence summary of the event>",
  "when": "<ISO date/time if specified, else descriptive>",
  "where": [{ "place": "<exact name from source>", "type": "city" | "state" | "country" | "venue" }],
  "why": "<motivation / cause if stated, else empty string>",
  "how": "<mechanism if stated, else empty string>",
  "quotes": [{ "speaker": "<full name>", "designation": "<title at time of quote>", "verb_of_saying": "<said|stated|announced|...>", "original_text": "<EXACT text inside quotation marks>" }],
  "numbers": [{ "value": "<digit string>", "unit": "<%|crore|degrees|km|...>", "context": "<what the number measures>" }],
  "key_facts": ["<concrete fact 1>", "<concrete fact 2>", "..."],
  "sub_headings": ["<suggested h3 topic 1>", "..."],
  "source_paragraphs": ["<source para verbatim>", "..."]
}

RULES:
- "quotes" array must contain ONLY text that appears between "..." or "..." (or after a clear "said:" colon) in the source. Reporter narration ("X said that Y") is NOT a quote — leave it out of this array.
- "numbers" captures every figure, percentage, currency amount, or measurement. Currency: keep the symbol in unit ("₹crore", "USD million").
- "where" captures every location mentioned, not just the dateline.
- "who" includes every named person + their designation.
- Never invent. If the source doesn't have a date, leave "when" empty.
- All strings in this envelope stay in the ORIGINAL LANGUAGE (English). The compose step translates.`;

export async function extractFacts(sourceText: string): Promise<ExtractedFacts> {
  const deployment = process.env.AZURE_OPENAI_EXTRACT_DEPLOYMENT || "gpt41-mini";
  const result = await chat({
    deployment,
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: sourceText.slice(0, 8000) },
    ],
    temperature: 0.1,
    maxTokens: 1500,
    responseFormatJson: true,
  });
  return parseJsonEnvelope<ExtractedFacts>(result.content);
}
