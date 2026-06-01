// Step 2 of the Telugu newsroom pipeline. Reads structured facts from
// extract.ts + produces Eenadu-style Telugu HTML article.
//
// Default model: GPT-5.1 (deployment "gpt51"). Swap to Claude Sonnet 4.6
// later by setting AZURE_OPENAI_COMPOSE_ENDPOINT + AZURE_OPENAI_COMPOSE_KEY
// + AZURE_OPENAI_COMPOSE_DEPLOYMENT envs.
import { chatJsonWithRetry } from "./client";
import { composeSystemPrompt, repairConstraintsPrompt } from "./style-guide";
import type { ExtractedFacts } from "./extract";
import type { FactCheckIssue } from "./fact-check";

export interface ComposedArticle {
  title_te: string;
  dek_te: string;
  slug_en: string;
  summary_te: string;
  body_html_te: string;
  keywords_en: string[];
  meta_description_en: string;
}

export async function composeArticle(
  facts: ExtractedFacts,
  repairIssues: FactCheckIssue[] = [],
): Promise<ComposedArticle> {
  const deployment = process.env.AZURE_OPENAI_COMPOSE_DEPLOYMENT || "gpt51";
  const endpoint = process.env.AZURE_OPENAI_COMPOSE_ENDPOINT || undefined;
  const key = process.env.AZURE_OPENAI_COMPOSE_KEY || undefined;

  const userPayload =
    `EXTRACTED FACTS (JSON):\n${JSON.stringify(facts, null, 2)}` +
    repairConstraintsPrompt(repairIssues);

  // Budgets cover most Telugu newspaper articles at 4000, long features
  // with embedded blockquotes at 8000, and extreme cases at 12000.
  // chatJsonWithRetry only escalates on Azure's finish_reason: "length".
  return chatJsonWithRetry<ComposedArticle>(
    {
      deployment,
      endpoint,
      key,
      messages: [
        { role: "system", content: composeSystemPrompt() },
        { role: "user", content: userPayload },
      ],
      temperature: 0.4,
    },
    [4000, 8000, 12000],
  );
}
