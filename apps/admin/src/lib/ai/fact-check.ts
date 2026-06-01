// Step 3 of the Telugu newsroom pipeline. Compares the composed Telugu
// article against the original English source + the extracted facts JSON.
// Returns a list of drift issues; the pipeline orchestrator decides whether
// to repair (re-run compose with constraints) or accept.
//
// Model: GPT-4.1-mini (deployment "gpt41-mini") - same cheap model as
// extract. Fact-check is comparison, no Telugu generation.
import { chatJsonWithRetry } from "./client";
import { factCheckSystemPrompt } from "./style-guide";
import type { ExtractedFacts } from "./extract";
import type { ComposedArticle } from "./compose";

export type FactCheckIssueType =
  | "fabricated_quote"
  | "date_mismatch"
  | "name_drift"
  | "number_drift"
  | "missing_attribution"
  | "editorializing"
  | "structural"
  | "register";

export interface FactCheckIssue {
  type: FactCheckIssueType;
  detail: string;
  location: string;
}

interface FactCheckResult {
  issues: FactCheckIssue[];
}

export async function factCheck(
  sourceText: string,
  facts: ExtractedFacts,
  article: ComposedArticle,
): Promise<FactCheckIssue[]> {
  const deployment = process.env.AZURE_OPENAI_FACTCHECK_DEPLOYMENT || "gpt41-mini";

  const userPayload = [
    `=== ORIGINAL SOURCE (English) ===`,
    sourceText.slice(0, 16000),
    ``,
    `=== EXTRACTED FACTS (JSON) ===`,
    JSON.stringify(facts, null, 2),
    ``,
    `=== COMPOSED TELUGU ARTICLE ===`,
    `Title: ${article.title_te}`,
    `Dek: ${article.dek_te}`,
    `Summary: ${article.summary_te}`,
    `Body HTML:`,
    article.body_html_te,
  ].join("\n");

  // Fact-check output is just an issues array, so the budget needn't be
  // huge, but a long article with many drift issues can still exceed
  // 1000 tokens (the previous cap). Schedule covers normal, busy, and
  // pathological cases.
  const parsed = await chatJsonWithRetry<FactCheckResult>(
    {
      deployment,
      messages: [
        { role: "system", content: factCheckSystemPrompt() },
        { role: "user", content: userPayload },
      ],
      temperature: 0.0,
    },
    [2000, 4000, 6000],
  );
  return Array.isArray(parsed?.issues) ? parsed.issues : [];
}
