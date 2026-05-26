// Step 2 of the Telugu newsroom pipeline. Reads structured facts from
// extract.ts + produces Eenadu-style Telugu HTML article.
//
// Default model: GPT-5.1 (deployment "gpt51"). Swap to Claude Sonnet 4.6
// later by setting AZURE_OPENAI_COMPOSE_ENDPOINT + AZURE_OPENAI_COMPOSE_KEY
// + AZURE_OPENAI_COMPOSE_DEPLOYMENT envs.
import { chat, parseJsonEnvelope } from "./client";
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

  const result = await chat({
    deployment,
    endpoint,
    key,
    messages: [
      { role: "system", content: composeSystemPrompt() },
      { role: "user", content: userPayload },
    ],
    temperature: 0.4,
    maxTokens: 2500,
    responseFormatJson: true,
  });

  return parseJsonEnvelope<ComposedArticle>(result.content);
}
