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

  // First attempt at the default cap. If the JSON envelope is truncated
  // mid-string (model hit max_tokens before closing the body_html_te
  // string), retry once with a higher cap.
  for (const maxTokens of [4000, 6000]) {
    const result = await chat({
      deployment,
      endpoint,
      key,
      messages: [
        { role: "system", content: composeSystemPrompt() },
        { role: "user", content: userPayload },
      ],
      temperature: 0.4,
      maxTokens,
      responseFormatJson: true,
    });
    try {
      return parseJsonEnvelope<ComposedArticle>(result.content);
    } catch (e) {
      if (maxTokens >= 6000) {
        console.error("[ai/compose] JSON parse failed even at maxTokens=6000:", (e as Error).message);
        console.error("[ai/compose] raw output tail:", result.content.slice(-500));
        throw new Error(`Compose returned unparseable JSON: ${(e as Error).message}`);
      }
      console.warn("[ai/compose] truncated JSON, retrying with maxTokens=6000");
    }
  }
  throw new Error("Compose retries exhausted");
}
