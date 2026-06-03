import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { getReporterId } from "@/lib/reporter-auth";
import { isUrlSafeToFetch } from "@/lib/ssrf-guard";
import { runPipeline } from "@/lib/ai/pipeline";
import { AITruncationError, AIContentFilterError, detectContentFilter, contentFilterUserMessage } from "@/lib/ai/client";
import { uploadImageFromUrl } from "@/lib/blob";
import { checkRateLimit } from "@/lib/rate-limit";

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

PRIMARY vs SECONDARY SPEECH (CRITICAL - most common AI failure):
- PRIMARY speech = direct quotes by a named person, marked in the source with quotation marks ("..." or "...") or phrases like "said", "stated", "అన్నారు", "చెప్పారు", "తెలిపారు". Render as <blockquote> in FIRST PERSON exactly as the speaker said it.
- SECONDARY speech = reporter narration ABOUT what someone said or did. Render as <p> in THIRD PERSON ("X said that...", "X మాట్లాడుతూ...అని పేర్కొన్నారు"). NEVER convert this into a fabricated first-person quote.
- DO NOT invent quotes. If the source does not contain quoted text by a person, your output MUST NOT contain a first-person quote attributed to that person.
- DO NOT switch a reporter's third-person summary into a speaker's first-person claim. That is fabrication.
- Proper nouns (people, place, party names) stay untranslated - write them in Telugu script phonetically, not translated.`;

// Rayalaseema dialect - ONLY for editorials/opinion pieces
const DIALECT_PROMPT = `You are an editorial writer for "Rayalaseema News". Write opinion/editorial pieces with Rayalaseema dialect flavor.

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

// Scrape full article + og:image from source URL.
//
// SSRF guard: prefix-checking the hostname misses cloud metadata endpoints
// (169.254.169.254 → Azure/AWS creds), IPv6 loopback (::1), IPv4-mapped IPv6,
// and DNS-rebinding tricks (evil.com → 127.0.0.1). isUrlSafeToFetch does a
// real DNS lookup and rejects any hostname whose A/AAAA records land in a
// private/loopback/link-local/multicast range - see lib/ssrf-guard.ts.
async function scrapeSource(url: string): Promise<{ text: string; ogImage: string | null; ogTitle: string | null }> {
  try {
    const safety = await isUrlSafeToFetch(url);
    if (!safety.safe) {
      console.error("[ai/rewrite] Refusing to scrape", url, "→", safety.reason);
      return { text: "", ogImage: null, ogTitle: null };
    }

    // Use a real browser User-Agent + Accept headers. Many publishers return
    // an empty shell (or block) bot-identifying UAs. This won't bypass
    // IP-level blocks (e.g. eenadu refuses datacenter IPs outright - use the
    // manual "paste text in body + translate" path for those), but it lets
    // the many sites that only gate on UA scrape correctly.
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,te;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    // Meta extraction BEFORE stripping tags - og:image / twitter:image /
    // og:title. Tolerant of attribute order; honors both " and '.
    const pickMeta = (re: RegExp): string | null => {
      const m = html.match(re);
      return m ? m[1].trim() : null;
    };
    const ogImage =
      pickMeta(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      pickMeta(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      pickMeta(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const ogTitle =
      pickMeta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      pickMeta(/<title[^>]*>([^<]+)<\/title>/i);

    // Readability-style extraction. Strip noise (scripts, styles, nav,
    // header, footer, aside, forms, comment widgets, social embeds, ads),
    // then PREFER the <article> / <main> element if one exists - those
    // wrap the actual story body on most modern news sites. Falls back
    // to <body> when neither is present. Cap raised from 5K to 18K chars
    // so multi-page wire reports (specific reliability targets, sectoral
    // tables, etc.) don't get truncated mid-fact.
    const stripped = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "")
      .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, "")
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
      // Common noise blocks by class/id heuristic (recursive content
      // strip would be cleaner with a real DOM parser, but the regex
      // below covers the worst offenders on Indian news sites).
      .replace(/<div[^>]*(?:class|id)=["'][^"']*(?:related|recommend|share|social|comment|newsletter|sidebar|ad-|advert|promo|popular|trending|footer|menu|nav-|cookie|gdpr|subscribe)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");

    // Prefer the <article> element; many publishers wrap the story body
    // there. Fall back to <main>, then <body>, then the whole document.
    const articleMatch = stripped.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = articleMatch ? null : stripped.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const bodyMatch = (articleMatch || mainMatch) ? null : stripped.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const core = articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || stripped;

    const text = core
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 18000);

    return { text, ogImage, ogTitle };
  } catch (e) {
    console.error("[ai/rewrite] Scrape error:", e);
    return { text: "", ogImage: null, ogTitle: null };
  }
}

export async function POST(req: NextRequest) {
  // Accept either an admin NextAuth session (admin web UI) or a reporter
  // Bearer token (mobile app's "Translate to Telugu" button). Cookie sessions
  // and bearer tokens are entirely separate auth schemes, so we try the
  // mobile path first and fall back to the admin-session check.
  const reporterId = await getReporterId(req);
  if (!reporterId) {
    const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
    if (isAuthError(session)) return session;
  }

  // Bill protection. Every call here can spend ~$0.01-$0.10 in Azure OpenAI
  // credits; 30/min per IP is generous for legitimate editorial use and
  // catches runaway scripts before they burn the budget. Returns 429 with
  // Retry-After when exceeded.
  const blocked = checkRateLimit(req, {
    max: 30,
    windowMs: 60_000,
    prefix: "ai-rewrite",
  });
  if (blocked) return blocked;

  if (!ENDPOINT || !KEY) {
    return NextResponse.json({ error: "AZURE_OPENAI not configured" }, { status: 503 });
  }
  try {
    const { text, action, sourceUrl } = await req.json();
    if (!text && !sourceUrl) return NextResponse.json({ error: "Text or source URL required" }, { status: 400 });

    // Refuse search-engine result pages. Pasting google.com/search?q=…
    // scrapes only snippet text → AI hallucinates a generic article. Same
    // for bing/yahoo/duckduckgo/yandex/baidu. Refuse loudly so the editor
    // pastes the actual article URL instead.
    if (sourceUrl) {
      const SEARCH_HOST_RE = /^https?:\/\/(?:[a-z0-9-]+\.)?(?:google|bing|yahoo|duckduckgo|yandex|baidu)\.[a-z.]+\/(?:search|news\/search|images|results|webhp)/i;
      if (SEARCH_HOST_RE.test(sourceUrl)) {
        return NextResponse.json({
          error: "Source URL is a search results page, not an article. Open one of the search results and paste THAT article's URL.",
        }, { status: 400 });
      }
    }

    // Scrape source URL for full content + og:image.
    let fullText = text || "";
    let hasScrapedContent = false;
    let scrapedOgImage: string | null = null;
    let scrapedOgTitle: string | null = null;
    if (sourceUrl) {
      const scraped = await scrapeSource(sourceUrl);
      scrapedOgTitle = scraped.ogTitle;
      // Rehost the source's og:image on Azure Blob (EXIF-stripped +
      // RE-stamped via uploadImageFromUrl → processImageBuffer).
      // Returning the raw publisher CDN URL meant the public site
      // hotlinked them - fragile (403 / takedowns / hotlink-blocked)
      // and skipped our metadata-cleanup pipeline.
      if (scraped.ogImage) {
        try {
          scrapedOgImage = await uploadImageFromUrl(scraped.ogImage);
        } catch (e) {
          console.warn("[ai/rewrite] og:image rehost failed:", (e as Error).message);
          scrapedOgImage = null;
        }
      }
      if (scraped.text.length > 100) {
        fullText = `SOURCE ARTICLE:\n${scraped.text}\n\nDESCRIPTION:\n${text}`;
        hasScrapedContent = true;
      }
    }

    // No-real-source guard. Article-building actions (full-import + translate)
    // must NOT run on empty content: if the scrape failed (the site blocks our
    // server - eenadu / paywalled / JS) and the editor only supplied a URL or a
    // few words, the model FABRICATES a plausible-but-fake article from the URL
    // slug (the exact bug: body+translate "generated" a Chandrababu story the
    // server never actually read). Refuse and point them to paste the real
    // text. Real pasted article text (>= ~40 words) still translates normally;
    // scrapable sites still work because hasScrapedContent is true.
    if ((action === "full-import" || action === "translate") && !hasScrapedContent) {
      const meaningfulWords = (text || "")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/\b(?:Title|Summary|Body)\s*:/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
      if (meaningfulWords < 40) {
        // A SOURCE URL we couldn't read is the dangerous case - the model would
        // fabricate a plausible-but-fake news article from the URL slug. Refuse
        // that, loudly.
        if (sourceUrl) {
          return NextResponse.json({
            error: "Couldn't read that source - the site blocks our server (common for eenadu, paywalled, or JavaScript pages). To avoid publishing a fabricated article, copy the article TEXT and paste it into the Body, then click తెలుగులో రాయండి.",
            code: "no_source_content",
          }, { status: 422 });
        }
        // No source URL: the editor TYPED a short brief / idea directly. That's
        // intentional, editor-directed authoring - NOT a silent fabrication from
        // a broken scrape - so proceed: expand the brief into a Telugu DRAFT the
        // editor then verifies. Returns the same {result} shape as translate, so
        // the client's translate handler (h2 -> title, body, auto-summary) just
        // works.
        if (action === "translate" && (text || "").trim()) {
          const briefRes = await fetch(
            `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "api-key": KEY },
              body: JSON.stringify({
                messages: [
                  { role: "system", content: NEWS_PROMPT },
                  {
                    role: "user",
                    content: `You are writing from a Telugu news editor's short brief / idea. Expand it into a complete, publishable Telugu newspaper article: an <h2> headline, an opening <p class="dek"> standfirst, then well-structured <p> body paragraphs.

STRICT RULES:
- Write ONLY in Telugu script (transliterate proper nouns, do not translate them).
- Do NOT invent specific unverifiable facts: no fake quotes, no fabricated statistics, no made-up names, dates or places beyond what the brief states. Where specifics are unknown, stay general and attribute nothing that was not given.
- This is a DRAFT for the editor to verify and finish.

EDITOR'S BRIEF:
${text}`,
                  },
                ],
                max_completion_tokens: 2000,
                temperature: 0.4,
              }),
            },
          );
          const briefData = await briefRes.json();
          const briefFiltered = detectContentFilter(briefData);
          if (briefFiltered) {
            return NextResponse.json(
              { error: contentFilterUserMessage(briefFiltered), code: "content_filter" },
              { status: 422 },
            );
          }
          if (briefData.error) {
            return NextResponse.json({ error: briefData.error.message }, { status: 500 });
          }
          return NextResponse.json({
            result: briefData.choices?.[0]?.message?.content || "",
            tokens: briefData.usage || {},
            model: briefData.model,
            fromBrief: true,
          });
        }
        return NextResponse.json({
          error: "Not enough source text to work from. Type a short brief in the Body (the AI will expand it into a draft), or paste the full article TEXT, then click తెలుగులో రాయండి.",
          code: "no_source_content",
        }, { status: 422 });
      }
    }

    // action="full-import" - Eenadu-grade pipeline (extract → compose →
    // fact-check + repair up to 2x). Each step lives in lib/ai/. The
    // pipeline returns the composed article PLUS any fact-check issues
    // remaining after retries, so the editor UI can surface them.
    if (action === "full-import") {
      try {
        const sourceForPipeline = scrapedOgTitle
          ? `Original headline: ${scrapedOgTitle}\n\n${fullText}`
          : fullText;
        const result = await runPipeline(sourceForPipeline);
        return NextResponse.json({
          title: result.article.title_te || scrapedOgTitle || "",
          slug: result.article.slug_en || "",
          summary: result.article.summary_te || "",
          // body_html_te already opens with <p class="dek"> per the
          // compose system prompt's HTML rule, so no extra prepend (the
          // earlier double-prepend showed the dek twice in the editor).
          body: result.article.body_html_te || "",
          keywords: Array.isArray(result.article.keywords_en) ? result.article.keywords_en : [],
          metaDescription: result.article.meta_description_en || "",
          ogImage: scrapedOgImage,
          factCheck: result.factCheck,
          // facts is null in polish mode (Telugu source bypasses extraction).
          extracted: result.facts
            ? { quotes: result.facts.quotes.length, people: result.facts.who.length }
            : { mode: result.mode },
        });
      } catch (e: any) {
        console.error("[ai/rewrite] pipeline failed:", e);
        // Content-filter blocks aren't recoverable - the same source would be
        // blocked again - so surface that one explicitly (no fallback).
        if (e instanceof AIContentFilterError) {
          return NextResponse.json({
            error: `Azure's content filter blocked the ${e.stage} (${e.categories.join(", ") || "unknown"}). The article likely contains material flagged by the safety policy - edit the source and retry, or use the dialect/translate modes which do not run the full pipeline.`,
            code: "ai_content_filter",
            stage: e.stage,
            categories: e.categories,
          }, { status: 422 });
        }
        // The structured pipeline failed (truncation / malformed JSON / etc.).
        // Fall back to the lenient single-shot translate so the editor still
        // gets a usable article instead of a hard error.
        try {
          const fbRes = await fetch(
            `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "api-key": KEY },
              body: JSON.stringify({
                messages: [
                  { role: "system", content: NEWS_PROMPT },
                  { role: "user", content: `Translate this news to standard Telugu. Write a complete newspaper article with a headline and paragraphs. Keep names of people, places and parties exactly as written (in Telugu script). Do not invent facts or quotes.\n\nSOURCE:\n${fullText}` },
                ],
                max_completion_tokens: 2000,
                temperature: 0.3,
              }),
            },
          );
          const fbData = await fbRes.json();
          const html: string = fbData.choices?.[0]?.message?.content || "";
          if (html) {
            const h2 = html.match(/<h2[^>]*>(.*?)<\/h2>/);
            return NextResponse.json({
              title: (h2 ? h2[1].replace(/<[^>]+>/g, "").trim() : scrapedOgTitle) || "",
              body: html,
              summary: "",
              ogImage: scrapedOgImage,
              fallback: true,
              note: "Structured import couldn't complete (article too long for one pass) - used a simple translation instead. Please review carefully before publishing.",
            });
          }
        } catch (fbErr) {
          console.error("[ai/rewrite] translate fallback failed:", fbErr);
        }
        // Fallback also failed - surface the original error.
        if (e instanceof AITruncationError) {
          return NextResponse.json({
            error: `This article is too long for the AI to process in one pass (output exceeded ${e.attemptedMaxTokens} tokens at every retry). Please trim the source to under ~2000 words and try again, or split it into two stories.`,
            code: "ai_truncated",
            attemptedMaxTokens: e.attemptedMaxTokens,
          }, { status: 413 });
        }
        return NextResponse.json({ error: e?.message || "Pipeline failed" }, { status: 500 });
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
      // Short-text translation - single word / phrase / label. No HTML, no
      // article structure, no quotes. Just the Telugu equivalent.
      phrase: `Translate this English text to Telugu. Return ONLY the Telugu translation as plain text - no quotes, no explanation, no English in brackets, no HTML:\n\n${fullText}`,
      rewrite: `Rewrite this as a standard Telugu newspaper article. Clean, professional Telugu:\n\n${fullText}`,
      editorial: `Write a Rayalaseema-style editorial/opinion piece about this topic. Use dialect words in headlines and quotes only:\n\n${fullText}`,
      dialect: `Add slight Rayalaseema dialect flavor to this article. Only change headlines and quotes, keep body in standard Telugu:\n\n${fullText}`,
      summarize: `Summarize this in Telugu in about 60 words (2-3 complete sentences). Always finish the last sentence - never stop mid-sentence or mid-word. Return only the summary, no HTML:\n\n${fullText}`,
      headline: `Suggest 5 catchy Telugu headlines for this article. Return as numbered list:\n\n${fullText}`,
      // Telugu (or any-language) headline → short SEO-friendly English URL slug.
      // 3-5 words, hyphenated, ASCII only. Used by the article editor to fill
      // the slug field as the user types the title.
      slug: `Convert this news headline into a short, SEO-friendly English URL slug.
RULES:
- 3 to 5 words ONLY
- All lowercase ASCII
- Words separated by hyphens
- No punctuation, no diacritics, no Telugu characters
- Capture the main subject + action (e.g. "rajadhani-construction-begins", not "the-rajadhani-construction-begins-tomorrow")
- Return ONLY the slug - no quotes, no explanation, no period at the end

HEADLINE:
${fullText}`,
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
    // Azure Responsible-AI content filter (prompt 400 or response finish_reason).
    // Crime/violence news legitimately trips it - return a clear, actionable
    // message instead of the raw Azure boilerplate.
    const filtered = detectContentFilter(data);
    if (filtered) {
      return NextResponse.json(
        { error: contentFilterUserMessage(filtered), code: "content_filter" },
        { status: 422 },
      );
    }
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
