// Orchestrates the 3-step Eenadu newsroom pipeline:
//
//   extract  → compose → fact-check → (repair if drift, max 2 attempts)
//
// Returns the final composed article + the fact-check report so the UI can
// show "AI flagged 2 issues, editor please verify" if drift remains after
// retries. Callers: /api/ai/rewrite (action=full-import) +
// /api/auto-fetch (importOneArticle).
import { extractFacts, type ExtractedFacts } from "./extract";
import { composeArticle, type ComposedArticle } from "./compose";
import { factCheck, type FactCheckIssue } from "./fact-check";
import { polishTelugu, isTeluguSource } from "./polish";

const MAX_REPAIR_ATTEMPTS = 2;

// Deterministic Latin-script backstop. The fact-checker LLM consistently
// misses proper-noun leakage (Modi, Lata Mangeshkar, song titles, X) even
// with explicit instructions, so we scan the composed body ourselves and
// inject synthetic `latin_script_in_body` issues for every offending run
// of Latin letters. Triggers a repair pass through composeArticle.
//
// What counts: any run of 3+ ASCII letters that is NOT inside an HTML tag
// or attribute. <h2>, <p>, <blockquote>, <cite>, class= attributes are
// fine; "Narendra Modi" or "Aajkal Tere Mere" inside the text content
// is not.
const LATIN_WORD_RE = /[A-Za-z]{3,}/g;
const HTML_TAG_RE = /<[^>]*>/g;

function detectLatinLeakage(article: ComposedArticle): FactCheckIssue[] {
  const issues: FactCheckIssue[] = [];
  const fields: Array<[keyof ComposedArticle, FactCheckIssue["location"]]> = [
    ["title_te", "headline"],
    ["dek_te", "dek"],
    ["summary_te", "lead_para"],
    ["body_html_te", "body_para_N"],
  ];
  for (const [field, location] of fields) {
    const raw = (article as any)[field];
    if (typeof raw !== "string" || raw.length === 0) continue;
    // Strip HTML tags + attributes so we only look at visible text.
    const textOnly = raw.replace(HTML_TAG_RE, " ");
    const hits = textOnly.match(LATIN_WORD_RE);
    if (!hits || hits.length === 0) continue;
    // Filter out the few Latin tokens that are legitimately allowed in
    // Telugu newsroom prose (acronyms render via parens, etc.).
    const ALLOWED = new Set(["AM", "PM", "IST", "GST", "CGST", "SGST", "IGST", "AC", "DC", "ATM", "OTP", "USB", "OK"]);
    const offending = hits.filter((h) => !ALLOWED.has(h.toUpperCase()));
    if (offending.length === 0) continue;
    const sample = offending.slice(0, 4).join(", ");
    issues.push({
      type: "latin_script_in_body",
      detail: `Latin-script word(s) found in ${field}: ${sample}${offending.length > 4 ? `, +${offending.length - 4} more` : ""}. Transliterate every proper noun, song title, platform name, and translate every English quote into Telugu script.`,
      location,
    });
  }
  return issues;
}

export interface PipelineResult {
  facts: ExtractedFacts | null;
  article: ComposedArticle;
  factCheck: {
    issues: FactCheckIssue[];   // remaining issues after retries (empty = clean)
    attempts: number;            // total compose calls (1 = clean first try)
  };
  mode: "translate" | "polish";  // which path ran
}

export async function runPipeline(sourceText: string): Promise<PipelineResult> {
  // If the source is ALREADY Telugu, skip the extract→compose round-trip
  // (which strips specifics during the Telugu→English JSON pass) and use
  // polish mode: ONE AI call that preserves every name/number/quote
  // verbatim and only cleans grammar + structure. Reported by the editor
  // on hmtvlive / sakshi sources where compose was inventing rally
  // boilerplate instead of using the real source content.
  if (isTeluguSource(sourceText)) {
    const article = await polishTelugu(sourceText);
    return {
      facts: null,
      article,
      factCheck: { issues: [], attempts: 1 },
      mode: "polish",
    };
  }

  // English / other-language source - full 3-step pipeline.
  const facts = await extractFacts(sourceText);

  let article = await composeArticle(facts);
  let llmIssues = await factCheck(sourceText, facts, article);
  let latinIssues = detectLatinLeakage(article);
  let issues = [...latinIssues, ...llmIssues];
  let attempts = 1;

  while (issues.length > 0 && attempts <= MAX_REPAIR_ATTEMPTS) {
    article = await composeArticle(facts, issues);
    llmIssues = await factCheck(sourceText, facts, article);
    latinIssues = detectLatinLeakage(article);
    issues = [...latinIssues, ...llmIssues];
    attempts++;
  }

  return {
    facts,
    article,
    factCheck: { issues, attempts },
    mode: "translate",
  };
}
