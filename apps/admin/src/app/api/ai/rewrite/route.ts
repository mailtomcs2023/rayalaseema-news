import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { getReporterId } from "@/lib/reporter-auth";
import { isUrlSafeToFetch } from "@/lib/ssrf-guard";

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const KEY = process.env.AZURE_OPENAI_KEY;
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt51";
const API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

// Standard Telugu - clean, professional, Eenadu-quality
const NEWS_PROMPT = `You are a professional Telugu newspaper editor. Write clean, standard Telugu news articles.

RULES:
1. Write in standard Telugu - the kind used in Eenadu, Sakshi, Andhra Jyothi newspapers
2. NO English words except proper nouns (names of people, places, organizations, technical terms)
3. Structure: <h2> for headline, <p> for paragraphs, <blockquote> for quotes
4. Keep facts 100% accurate - NEVER fabricate
5. Write 300-500 words
6. Professional newspaper tone - not casual, not overly formal
7. Write like a HUMAN journalist, not like AI
8. NEVER put translations in brackets
9. If the source is in English, translate naturally - don't do word-by-word translation

PRIMARY vs SECONDARY SPEECH (CRITICAL — most common AI failure):
- PRIMARY speech = direct quotes by a named person, marked in the source with quotation marks ("..." or "...") or phrases like "said", "stated", "అన్నారు", "చెప్పారు", "తెలిపారు". Render as <blockquote> in FIRST PERSON exactly as the speaker said it.
- SECONDARY speech = reporter narration ABOUT what someone said or did. Render as <p> in THIRD PERSON ("X said that...", "X మాట్లాడుతూ...అని పేర్కొన్నారు"). NEVER convert this into a fabricated first-person quote.
- DO NOT invent quotes. If the source does not contain quoted text by a person, your output MUST NOT contain a first-person quote attributed to that person.
- DO NOT switch a reporter's third-person summary into a speaker's first-person claim. That is fabrication.
- Proper nouns (people, place, party names) stay untranslated — write them in Telugu script phonetically, not translated.`;

// Rayalaseema dialect - ONLY for editorials/opinion pieces
const DIALECT_PROMPT = `You are an editorial writer for "Rayalaseema Express". Write opinion/editorial pieces with Rayalaseema dialect flavor.

RULES:
1. This is an EDITORIAL/OPINION piece, not news
2. Use Rayalaseema dialect words naturally (max 3-4 per article)
3. Dialect words only in headlines and direct quotes from locals
4. Body text should be 95% standard Telugu
5. Structure: <h2> headline, <p> paragraphs, <blockquote> quotes from locals
6. Write 300-500 words

DIALECT WORDS (use sparingly):
బేజారు=విసుగు, బిరీన=తొందరగా, కొల్ల=ఎక్కువ, జాస్తి=ఎక్కువ,
నిమ్మలం=ప్రశాంతంగా, చిక్కుబాటు=సంక్లిష్ట స్థితి, దావ=దారి,
లెక్క=డబ్బు, పైపైమాటలు=hollow promises, సీమ=రాయలసీమ,
గాంధారి వాన=భారీ వర్షం, మోడం=మొబ్బు, కసురు=అరవడం, రావిడి=గోల`;

// Scrape full article from source URL.
//
// SSRF guard: prefix-checking the hostname misses cloud metadata endpoints
// (169.254.169.254 → Azure/AWS creds), IPv6 loopback (::1), IPv4-mapped IPv6,
// and DNS-rebinding tricks (evil.com → 127.0.0.1). isUrlSafeToFetch does a
// real DNS lookup and rejects any hostname whose A/AAAA records land in a
// private/loopback/link-local/multicast range — see lib/ssrf-guard.ts.
async function scrapeSource(url: string): Promise<string> {
  try {
    const safety = await isUrlSafeToFetch(url);
    if (!safety.safe) {
      console.error("[ai/rewrite] Refusing to scrape", url, "→", safety.reason);
      return "";
    }

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RayalaseemaExpress/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 5000);
  } catch (e) { console.error("[ai/rewrite] Scrape error:", e); return ""; }
}

export async function POST(req: NextRequest) {
  // Accept either an admin NextAuth session (admin web UI) or a reporter
  // Bearer token (mobile app's "Translate to Telugu" button). Cookie sessions
  // and bearer tokens are entirely separate auth schemes, so we try the
  // mobile path first and fall back to the admin-session check.
  const reporterId = await getReporterId(req);
  if (!reporterId) {
    const session = await requireAuth(["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR", "SUB_EDITOR", "REPORTER"]);
    if (isAuthError(session)) return session;
  }
  if (!ENDPOINT || !KEY) {
    return NextResponse.json({ error: "AZURE_OPENAI not configured" }, { status: 503 });
  }
  try {
    const { text, action, sourceUrl } = await req.json();
    if (!text && !sourceUrl) return NextResponse.json({ error: "Text or source URL required" }, { status: 400 });

    // Scrape source URL for full content
    let fullText = text || "";
    if (sourceUrl) {
      const scraped = await scrapeSource(sourceUrl);
      if (scraped.length > 100) {
        fullText = `SOURCE ARTICLE:\n${scraped}\n\nDESCRIPTION:\n${text}`;
      }
    }

    // Choose prompt based on action
    const isDialect = action === "editorial" || action === "dialect";
    const systemPrompt = isDialect ? DIALECT_PROMPT : NEWS_PROMPT;

    const prompts: Record<string, string> = {
      translate: `Translate this news to standard Telugu. Write a complete newspaper article with headline and paragraphs.

STRICT FIDELITY RULES:
- Only render <blockquote> first-person quotes for text that is ACTUALLY QUOTED in the source (inside "..." or "...") or explicitly introduced as a direct quote.
- Reporter narration ("X said that Y", "X మాట్లాడుతూ...అని పేర్కొన్నారు") MUST stay as third-person <p>, NOT be flipped into a fake first-person <blockquote>.
- Do NOT invent statements, emotions, or claims that are not in the source.
- Keep names of people, places, parties exactly as written (transliterated to Telugu script, not translated).

SOURCE:
${fullText}`,
      // Short-text translation — single word / phrase / label. No HTML, no
      // article structure, no quotes. Just the Telugu equivalent.
      phrase: `Translate this English text to Telugu. Return ONLY the Telugu translation as plain text — no quotes, no explanation, no English in brackets, no HTML:\n\n${fullText}`,
      rewrite: `Rewrite this as a standard Telugu newspaper article. Clean, professional Telugu:\n\n${fullText}`,
      editorial: `Write a Rayalaseema-style editorial/opinion piece about this topic. Use dialect words in headlines and quotes only:\n\n${fullText}`,
      dialect: `Add slight Rayalaseema dialect flavor to this article. Only change headlines and quotes, keep body in standard Telugu:\n\n${fullText}`,
      summarize: `Summarize in exactly 60 words in Telugu. Only return the summary, no HTML:\n\n${fullText}`,
      headline: `Suggest 5 catchy Telugu headlines for this article. Return as numbered list:\n\n${fullText}`,
      proofread: `Proofread and fix Telugu spelling/grammar errors. Return corrected HTML:\n\n${fullText}`,
      expand: `Expand this short news into a full 400-word Telugu newspaper article:\n\n${fullText}`,
    };

    const res = await fetch(
      `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": KEY },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompts[action] || prompts.translate },
          ],
          max_completion_tokens: 2000,
          // Lower temp for translation/news to suppress hallucinated quotes.
          // Editorial action still uses 0.5 because it's an opinion piece.
          temperature: isDialect ? 0.5 : 0.3,
        }),
      }
    );

    const data = await res.json();
    if (data.error) return NextResponse.json({ error: data.error.message }, { status: 500 });

    return NextResponse.json({
      result: data.choices?.[0]?.message?.content || "",
      tokens: data.usage || {},
      model: data.model,
    });
  } catch (error: unknown) {
    return apiError(error);
  }
}
