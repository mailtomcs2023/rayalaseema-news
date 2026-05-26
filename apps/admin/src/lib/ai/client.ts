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
  // compose) — pass the deployment name string directly.
  deployment: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  // When true, set response_format=json_object so the model is forced to
  // emit strict JSON. Used by extract + fact-check (always) and compose
  // (always, since style-guide.ts asks for a JSON envelope).
  responseFormatJson?: boolean;
  // Optional per-call endpoint override. Used when compose moves to
  // Claude (different Azure resource) — extract + fact-check stay on the
  // OpenAI resource via the default ENDPOINT.
  endpoint?: string;
  key?: string;
}

export interface ChatResult {
  content: string;
  tokens: { prompt?: number; completion?: number; total?: number };
  model?: string;
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
    throw new Error(`Azure OpenAI ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || "Azure OpenAI error");
  return {
    content: data.choices?.[0]?.message?.content || "",
    tokens: {
      prompt: data.usage?.prompt_tokens,
      completion: data.usage?.completion_tokens,
      total: data.usage?.total_tokens,
    },
    model: data.model,
  };
}

// Parse a JSON envelope tolerantly. response_format=json_object usually
// returns a clean object, but some model versions wrap output in markdown
// fences anyway — strip them before parsing.
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
