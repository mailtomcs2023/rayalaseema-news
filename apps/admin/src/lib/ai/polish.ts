// Telugu-passthrough polish mode. When the source is already Telugu,
// running it through extract (Telugu → English JSON) + compose
// (JSON → Telugu) loses the specifics - named persons, numbers,
// quotes get summarized away and the compose step fills the gap with
// generic political-rally boilerplate. Reported repeatedly by the
// editor on real Sakshi / Hmtv / Eenadu source URLs.
//
// Polish mode does ONE AI call that:
//   1. Preserves every name / number / quote / claim verbatim
//   2. Cleans grammar + typos
//   3. Adds <h2> headline + <p class="dek"> if missing
//   4. Splits long paragraphs into 2-3 sentence chunks
//   5. Inserts <h3> sub-heads on stories >300 words
//
// The model is INSTRUCTED to refuse to add anything not in the source.
import { chatJsonWithRetry } from "./client";

export interface PolishedArticle {
  title_te: string;
  dek_te: string;
  slug_en: string;
  summary_te: string;
  body_html_te: string;
  keywords_en: string[];
  meta_description_en: string;
}

const POLISH_SYSTEM = `You are a senior copy editor at Eenadu's Hyderabad desk. The article below is ALREADY in Telugu. Your job is to POLISH it for newspaper publication - NOT to rewrite, summarize, or expand.

ABSOLUTE RULES - break any and you fail:

1. PRESERVE every fact. Every named person, every number, every place, every quote, every claim, every date, every party / organization / role designation must appear in your output exactly as in the source. If the source names "Daggupati Prasad MLA", your output names "Daggupati Prasad MLA". If the source mentions "12 cluster constituencies", you keep "12 cluster constituencies". NEVER drop a specific name in favor of a generic phrase.

2. NEVER INVENT. Do NOT add:
   - Names not in the source ("Chandrababu Naidu" if source says only "party president")
   - Numbers / dates not in the source
   - Quotes the source doesn't have
   - "Party sources said…" / "Analysts believe…" / "It is learnt that…" boilerplate
   - Future-tense speculation ("the party is expected to…")
   - Generic political commentary (welfare programs, investments, employment, road maps) unless EXPLICITLY in the source

3. POLISH ONLY. You may:
   - Fix obvious grammar / typo errors
   - Split a long paragraph into 2-3 sentence chunks
   - Add sub-heads (<h3>) when the source has clearly distinct topic blocks
   - Produce a headline (<h2>) - 7-12 words, derived ONLY from source facts
   - Produce a dek (<p class="dek">) - 2-line standfirst summarizing what's already in the source
   - Sort paragraphs into inverted-pyramid order (most important first)

4. SCRIPT INTEGRITY. Output is 100% Telugu Unicode (U+0C00-0C7F). NO Devanagari conjuncts. Latin script only inside the JSON envelope's English fields (slug_en, keywords_en, meta_description_en).

5. OUTPUT FORMAT - strict JSON envelope, nothing else:
{
  "title_te": "<headline derived from source>",
  "dek_te": "<2-line standfirst, source facts only>",
  "slug_en": "<lowercase kebab-case English SEO slug, 4-10 words>",
  "summary_te": "<60-80 word Telugu summary using ONLY source facts>",
  "body_html_te": "<polished body: <p class='dek'> then <p>s + optional <h3>s; <blockquote><cite> for source-quoted text>",
  "keywords_en": ["english", "seo", "keywords", "5-10 items"],
  "meta_description_en": "<150-char English meta description>"
}

If the source has fewer than ~100 words OR is malformed, return the JSON envelope with title_te + summary_te filled but body_html_te equal to the source wrapped in <p> tags. NEVER pad with invented content.`;

export async function polishTelugu(sourceText: string): Promise<PolishedArticle> {
  const deployment = process.env.AZURE_OPENAI_COMPOSE_DEPLOYMENT || "gpt51";
  const endpoint = process.env.AZURE_OPENAI_COMPOSE_ENDPOINT || undefined;
  const key = process.env.AZURE_OPENAI_COMPOSE_KEY || undefined;

  // Polish preserves source content verbatim, so the output is roughly the
  // same size as the input. Budgets match compose since both produce a
  // full body_html_te.
  return chatJsonWithRetry<PolishedArticle>(
    {
      deployment, endpoint, key,
      messages: [
        { role: "system", content: POLISH_SYSTEM },
        { role: "user", content: `SOURCE (Telugu, already published):\n\n${sourceText}` },
      ],
      temperature: 0.2,
    },
    [4000, 8000, 12000],
  );
}

// Telugu Unicode (U+0C00-0C7F). Returns true if >=30% of the input's
// non-whitespace characters are Telugu glyphs - high enough threshold
// that a news article with a few English brand names still counts as
// Telugu, low enough that a one-line Telugu caption inside an English
// page is NOT classified as Telugu.
export function isTeluguSource(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 4000);
  let telugu = 0;
  let nonSpace = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c <= 32) continue;
    nonSpace++;
    if (c >= 0x0C00 && c <= 0x0C7F) telugu++;
  }
  if (nonSpace < 100) return false;
  return telugu / nonSpace >= 0.3;
}
