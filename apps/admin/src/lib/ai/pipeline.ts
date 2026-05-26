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

const MAX_REPAIR_ATTEMPTS = 2;

export interface PipelineResult {
  facts: ExtractedFacts;
  article: ComposedArticle;
  factCheck: {
    issues: FactCheckIssue[];   // remaining issues after retries (empty = clean)
    attempts: number;            // total compose calls (1 = clean first try)
  };
}

export async function runPipeline(sourceText: string): Promise<PipelineResult> {
  const facts = await extractFacts(sourceText);

  let article = await composeArticle(facts);
  let issues = await factCheck(sourceText, facts, article);
  let attempts = 1;

  while (issues.length > 0 && attempts <= MAX_REPAIR_ATTEMPTS) {
    article = await composeArticle(facts, issues);
    issues = await factCheck(sourceText, facts, article);
    attempts++;
  }

  return {
    facts,
    article,
    factCheck: { issues, attempts },
  };
}
