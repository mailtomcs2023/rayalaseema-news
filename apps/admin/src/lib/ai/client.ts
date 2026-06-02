// Single HTTP helper that hits any chat-completions-compatible endpoint.
// Used by extract / compose / fact-check so swapping a model = env-var change.
//
// Today: all 3 steps point at Azure OpenAI (gpt41-mini / gpt-5.1).
// Tomorrow: compose step env can point at Claude on Azure AI Foundry (same
// OpenAI-compatible chat-completions shape) without touching this file.

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const KEY = process.env.AZURE_OPENAI_KEY;
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOpts {
  // Azure deployment name OR an env-var override. The pipeline picks
  // different models per step (e.g. gpt41-mini for extract, gpt51 for
  // compose) - pass the deployment name string directly.
  deployment: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  // When true, set response_format=json_object so the model is forced to
  // emit strict JSON. Used by extract + fact-check (always) and compose
  // (always, since style-guide.ts asks for a JSON envelope).
  responseFormatJson?: boolean;
  // Optional per-call endpoint override. Used when compose moves to
  // Claude (different Azure resource) - extract + fact-check stay on the
  // OpenAI resource via the default ENDPOINT.
  endpoint?: string;
  key?: string;
}

export interface ChatResult {
  content: string;
  tokens: { prompt?: number; completion?: number; total?: number };
  model?: string;
  // Azure / OpenAI finish reason: "stop" | "length" | "content_filter" | "tool_calls".
  // Callers use "length" to detect truncation and retry with a bigger budget.
  finishReason?: string;
}

// Thrown when Azure's Responsible AI policy blocks either the prompt
// (HTTP 400 with error.code === "content_filter") or the completion
// (HTTP 200 with finish_reason === "content_filter"). Carries the list
// of triggered categories so callers can show "blocked: violence" etc.
// instead of the raw Azure boilerplate.
export class AIContentFilterError extends Error {
  readonly categories: string[];
  readonly stage: "prompt" | "response";
  constructor(stage: "prompt" | "response", categories: string[]) {
    const cats = categories.length ? categories.join(", ") : "unknown";
    super(`Azure content filter blocked the ${stage} (${cats})`);
    this.name = "AIContentFilterError";
    this.categories = categories;
    this.stage = stage;
  }
}

// Thrown by chatJsonWithRetry when the model's JSON response was truncated
// (finish_reason: "length") at every budget in the retry schedule.
// Carries the final attempted budget so the API layer can produce a
// user-visible "article too long" message instead of leaking a 500.
export class AITruncationError extends Error {
  readonly attemptedMaxTokens: number;
  readonly budgets: number[];
  constructor(budgets: number[]) {
    const last = budgets[budgets.length - 1] ?? 0;
    super(`AI output was truncated at every retry (max budget tried: ${last} tokens)`);
    this.name = "AITruncationError";
    this.attemptedMaxTokens = last;
    this.budgets = budgets;
  }
}

// Pull the triggered category names out of Azure's content_filter_results
// shape: { hate: { filtered: bool, severity }, violence: {...}, ... }
function triggeredCategories(filterResults: unknown): string[] {
  if (!filterResults || typeof filterResults !== "object") return [];
  const out: string[] = [];
  for (const [name, val] of Object.entries(filterResults as Record<string, unknown>)) {
    if (val && typeof val === "object" && (val as { filtered?: boolean }).filtered) {
      out.push(name);
    }
  }
  return out;
}

export async function chat(opts: ChatOpts): Promise<ChatResult> {
  const ep = opts.endpoint || ENDPOINT;
  const k = opts.key || KEY;
  if (!ep || !k) throw new Error("AZURE_OPENAI endpoint/key not configured");

  const res = await fetch(
    `${ep}openai/deployments/${opts.deployment}/chat/completions?api-version=${API_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": k },
      body: JSON.stringify({
        messages: opts.messages,
        temperature: opts.temperature ?? 0.4,
        max_completion_tokens: opts.maxTokens ?? 2000,
        ...(opts.responseFormatJson ? { response_format: { type: "json_object" } } : {}),
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    // Prompt-side content filter - Azure returns 400 with a structured
    // error envelope. Try to parse and surface the triggered categories.
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.code === "content_filter") {
        const cats = triggeredCategories(parsed?.error?.innererror?.content_filter_result);
        throw new AIContentFilterError("prompt", cats);
      }
    } catch (e) {
      if (e instanceof AIContentFilterError) throw e;
      // JSON parse failed - fall through to generic error below.
    }
    throw new Error(`Azure OpenAI ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  if (data?.error) {
    if (data.error?.code === "content_filter") {
      const cats = triggeredCategories(data.error?.innererror?.content_filter_result);
      throw new AIContentFilterError("prompt", cats);
    }
    throw new Error(data.error.message || "Azure OpenAI error");
  }
  // Response-side content filter - Azure returns 200 but finish_reason is
  // "content_filter" and the choice carries per-category results.
  const choice = data.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    const cats = triggeredCategories(choice?.content_filter_results);
    throw new AIContentFilterError("response", cats);
  }
  return {
    content: choice?.message?.content || "",
    tokens: {
      prompt: data.usage?.prompt_tokens,
      completion: data.usage?.completion_tokens,
      total: data.usage?.total_tokens,
    },
    model: data.model,
    finishReason: choice?.finish_reason,
  };
}

// Wraps chat() + parseJsonEnvelope() with truncation-aware retry. Detects
// finish_reason === "length" (the model ran out of output tokens before
// closing its JSON envelope) and re-runs with the next budget in the
// schedule. Any other finish_reason returns immediately and the content is
// parsed - if JSON.parse fails on a non-truncated response, that's a real
// model error and we throw, no point retrying.
//
// Throws AITruncationError if every budget was truncated. Callers
// (route handlers) catch this and surface a user-visible "article too long"
// message instead of a 500.
export async function chatJsonWithRetry<T = unknown>(
  baseOpts: Omit<ChatOpts, "maxTokens" | "responseFormatJson">,
  budgets: number[],
): Promise<T> {
  if (budgets.length === 0) throw new Error("chatJsonWithRetry requires at least one budget");
  let lastContent = "";
  for (let i = 0; i < budgets.length; i++) {
    const maxTokens = budgets[i];
    const result = await chat({ ...baseOpts, maxTokens, responseFormatJson: true });
    lastContent = result.content;
    const isLast = i === budgets.length - 1;
    if (result.finishReason === "length") {
      if (isLast) break;
      console.warn(
        `[ai] response truncated at maxTokens=${maxTokens}, retrying with ${budgets[i + 1]}`,
      );
      continue;
    }
    try {
      return parseJsonEnvelope<T>(result.content);
    } catch (e) {
      // Malformed JSON ("Unterminated string in JSON", etc.) is usually a
      // silent truncation the API reported as finish_reason="stop" rather than
      // "length". Retry with a larger budget before giving up, instead of
      // throwing a SyntaxError that 500s the caller.
      if (isLast) break;
      console.warn(
        `[ai] JSON parse failed at maxTokens=${maxTokens} (${(e as Error).message}); retrying with ${budgets[i + 1]}`,
      );
      continue;
    }
  }
  console.error("[ai] output truncated/unparseable at every budget; tail:", lastContent.slice(-300));
  throw new AITruncationError(budgets);
}

// Parse a JSON envelope tolerantly. response_format=json_object usually
// returns a clean object, but some model versions wrap output in markdown
// fences anyway - strip them before parsing.
export function parseJsonEnvelope<T = unknown>(raw: string): T {
  let s = raw.trim();
  // Strip ```json ... ``` fences if present.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // If still wrapped in prose, grab the outermost { ... } block.
  if (!s.startsWith("{")) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0];
  }
  return JSON.parse(s) as T;
}
