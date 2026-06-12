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
// Optional Jina Reader key. The fallback works keyless (free tier, rate-
// limited ~20 rpm); a key raises the limit. Never commit a real value.
const JINA_KEY = process.env.JINA_API_KEY;

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

// Fallback reader for sources that block our server's direct fetch.
//
// Many Indian publishers (eenadu, sakshi, ...) refuse datacenter/cloud IPs at
// the edge - the prod VM gets a 403/empty/JS-shell while a residential IP (a
// reporter's laptop in local dev) gets the full article. That's why "it works
// in local but blocks on the server": SAME code, different egress IP.
//
// Jina AI Reader (r.jina.ai) fetches + JS-renders the page from Jina's own
// (non-blocked) IPs and returns clean content, so the SERVER can read the real
// article like local does - instead of the model fabricating from the URL slug.
// We still SSRF-validate the ORIGINAL url before ever asking Jina to read it.
async function scrapeViaJina(
  url: string,
): Promise<{ text: string; ogImage: string | null; ogTitle: string | null }> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (JINA_KEY) headers.Authorization = `Bearer ${JINA_KEY}`;
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers,
      // Jina renders the page, so give it longer than the direct fetch.
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.warn("[ai/rewrite] Jina reader HTTP", res.status, "for", url);
      return { text: "", ogImage: null, ogTitle: null };
    }
    const json = await res.json();
    const d = (json && json.data) || {};
    const content: string = typeof d.content === "string" ? d.content : "";
    // Jina returns Markdown. The model wants prose, so strip image/link syntax
    // and markdown punctuation down to plain text. Capture the first content
    // image URL for the og:image (Jina embeds them as ![alt](https://...)).
    const imgMatch = content.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
    const text = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")        // images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")        // links -> keep label
      .replace(/^[>#*\-+|]+/gm, " ")                  // md line markers
      .replace(/[`*_~]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 18000);
    const ogTitle: string | null =
      typeof d.title === "string" && d.title.trim() ? d.title.trim() : null;
    const ogImage: string | null = imgMatch ? imgMatch[1] : null;
    return { text, ogImage, ogTitle };
  } catch (e) {
    console.error("[ai/rewrite] Jina reader error:", e);
    return { text: "", ogImage: null, ogTitle: null };
  }
}

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

    // Direct fetch succeeded and gave us real content - use it (fast path,
    // no third party). This is the common case for sites that don't block us.
    if (text.length > 100) {
      return { text, ogImage, ogTitle };
    }

    // Direct fetch returned a block page / empty shell (datacenter IP refused,
    // or the body is JS-rendered). Read it through Jina instead so the server
    // gets the real article rather than fabricating from the URL slug.
    console.warn(
      `[ai/rewrite] direct scrape thin (${text.length} chars) - falling back to Jina reader: ${url}`,
    );
    const viaJina = await scrapeViaJina(url);
    return {
      text: viaJina.text.length > text.length ? viaJina.text : text,
      ogImage: ogImage || viaJina.ogImage,
      ogTitle: ogTitle || viaJina.ogTitle,
    };
  } catch (e) {
    // Direct fetch threw (timeout / connection refused / TLS). The URL already
    // passed the SSRF check above, so try Jina before giving up.
    console.error("[ai/rewrite] Scrape error, trying Jina reader:", e);
    return await scrapeViaJina(url);
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

    // No-real-source guard. EVERY article-building action - including editorial
    // and dialect, which previously had NO guard and silently invented an
    // opinion piece from the URL slug - must NOT run on empty content: if the
    // scrape failed (the site blocks our server - eenadu / paywalled / JS) and
    // the editor only supplied a URL or a few words, the model FABRICATES a
    // plausible-but-fake article (the exact bug: body+translate "generated" a
    // Chandrababu story the server never read; editorial did the same with no
    // warning). Refuse and point them to paste the real text. Real pasted text
    // (>= ~40 words) still works; scrapable sites still work (hasScrapedContent).
    const ARTICLE_BUILD_ACTIONS = new Set([
      "full-import", "breaking-import", "translate", "editorial", "dialect", "expand", "rewrite",
    ]);
    if (ARTICLE_BUILD_ACTIONS.has(action) && !hasScrapedContent) {
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
        // No source URL and not translate's brief-expander. For editorial /
        // dialect / expand / rewrite the editor may be authoring from a short
        // TYPED brief - intentional, so let it fall through to the action's own
        // prompt below. Only refuse when there's truly no text at all.
        if (!(text || "").replace(/<[^>]+>/g, " ").trim()) {
          return NextResponse.json({
            error: "Not enough source text to work from. Type a short brief in the Body (the AI will expand it into a draft), or paste the full article TEXT, then click తెలుగులో రాయండి.",
            code: "no_source_content",
          }, { status: 422 });
        }
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

    // action="breaking-rewrite" - the BREAKING_NEWS "rewrite" button. Takes the
    // editor's current Title + Summary and rewrites BOTH into crisp, broadcast-
    // grade professional Telugu (Eenadu / Sakshi / TV9 style), returning JSON
    // {title, summary}. Works on the editor's own text (no source URL), so it is
    // deliberately NOT in ARTICLE_BUILD_ACTIONS - polishing existing short text
    // is intentional, not a fabrication risk.
    if (action === "breaking-rewrite") {
      const brRes = await fetch(
        `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": KEY },
          body: JSON.stringify({
            messages: [
              { role: "system", content: NEWS_PROMPT },
              {
                role: "user",
                content: `You are a Telugu breaking-news editor for a top TV channel / newspaper (Eenadu, Sakshi, TV9 quality). Rewrite the given headline and summary into crisp, professional, broadcast-grade Telugu. Return STRICT JSON (no markdown, no code fences) with exactly these keys:
{
  "title": "ONE punchy Telugu breaking headline, 6-14 words, flash-news style, plain text, no surrounding quotes",
  "summary": "2 to 3 complete, professional Telugu sentences (~50 words). Always finish the last sentence."
}
STRICT RULES:
- Improve clarity, flow and impact, but keep it STRICTLY factual - do NOT add facts, numbers, names, dates or claims that are not in the input.
- Telugu only; transliterate proper nouns (people, places, parties), do NOT translate them.
- If the input summary is empty, return an empty string for "summary" - do NOT invent one.
- Return ONLY the JSON object.

INPUT:
${fullText}`,
              },
            ],
            max_completion_tokens: 700,
            temperature: 0.4,
          }),
        },
      );
      const brData = await brRes.json();
      const brFiltered = detectContentFilter(brData);
      if (brFiltered) {
        return NextResponse.json(
          { error: contentFilterUserMessage(brFiltered), code: "content_filter" },
          { status: 422 },
        );
      }
      if (brData.error) return NextResponse.json({ error: brData.error.message }, { status: 500 });

      const raw: string = brData.choices?.[0]?.message?.content || "";
      let parsed: { title?: string; summary?: string } = {};
      try {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) parsed = JSON.parse(raw.slice(start, end + 1));
      } catch {
        parsed = {};
      }
      const title = String(parsed.title || "").replace(/<[^>]+>/g, "").trim();
      const summary = String(parsed.summary || "").replace(/<[^>]+>/g, "").trim();
      if (!title && !summary) {
        return NextResponse.json(
          { error: "Couldn't rewrite that - try adding a bit more text in the Title or Summary first." },
          { status: 422 },
        );
      }
      return NextResponse.json({ title, summary });
    }

    // action="breaking-import" - paste a news URL on the BREAKING_NEWS form and
    // get back the three ticker fields {title, slug, summary} in ONE light call.
    // Unlike full-import this skips the article pipeline (no body, no fact-check)
    // because a breaking entry is a one-line headline + short summary, so the
    // heavy compose/repair loop would be wasted tokens and latency.
    if (action === "breaking-import") {
      const sourceForModel = scrapedOgTitle
        ? `Original headline: ${scrapedOgTitle}\n\n${fullText}`
        : fullText;
      const biRes = await fetch(
        `${ENDPOINT}openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": KEY },
          body: JSON.stringify({
            messages: [
              { role: "system", content: NEWS_PROMPT },
              {
                role: "user",
                content: `From the SOURCE ARTICLE below, produce a breaking-news entry as STRICT JSON (no markdown, no code fences) with exactly these keys:
{
  "title": "ONE crisp Telugu breaking-news ticker headline, 6-14 words, Eenadu/Sakshi flash style, plain text, no surrounding quotes",
  "summary": "2 to 3 complete Telugu sentences (~50 words) summarising the news. Always finish the last sentence.",
  "slug": "short English SEO url slug, 3-5 lowercase words, hyphen-separated, ASCII only, no Telugu"
}
STRICT RULES:
- Telugu for title and summary; transliterate proper nouns (people, places, parties), do NOT translate them.
- Do NOT invent facts, numbers, names, dates or places that are not in the source.
- Return ONLY the JSON object.

SOURCE ARTICLE:
${sourceForModel}`,
              },
            ],
            max_completion_tokens: 700,
            temperature: 0.3,
          }),
        },
      );
      const biData = await biRes.json();
      const biFiltered = detectContentFilter(biData);
      if (biFiltered) {
        return NextResponse.json(
          { error: contentFilterUserMessage(biFiltered), code: "content_filter" },
          { status: 422 },
        );
      }
      if (biData.error) return NextResponse.json({ error: biData.error.message }, { status: 500 });

      const raw: string = biData.choices?.[0]?.message?.content || "";
      let parsed: { title?: string; summary?: string; slug?: string } = {};
      try {
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) parsed = JSON.parse(raw.slice(start, end + 1));
      } catch {
        parsed = {};
      }
      const title = String(parsed.title || scrapedOgTitle || "").replace(/<[^>]+>/g, "").trim();
      const summary = String(parsed.summary || "").replace(/<[^>]+>/g, "").trim();
      const slug = String(parsed.slug || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .split("-")
        .filter(Boolean)
        .slice(0, 6)
        .join("-");
      if (!title && !summary) {
        return NextResponse.json(
          { error: "Couldn't read that source well enough to write a breaking entry. Try the article's direct URL, or type the headline in the Title and use తెలుగులో రాయండి." },
          { status: 422 },
        );
      }
      return NextResponse.json({ title, summary, slug, ogImage: scrapedOgImage });
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
      // Breaking-news ticker line - ONE crisp Telugu flash headline (Eenadu /
      // Sakshi style). Plain text, one line, no body. Used by the breaking-news
      // editor's "తెలుగులో రాయండి" button.
      breaking: `Rewrite this into ONE crisp Telugu breaking-news ticker headline, in the style of Eenadu / Sakshi flash news ("బ్రేకింగ్").
RULES:
- ONE single line of plain text only - no HTML, no surrounding quotes, no numbering, no explanation
- 6 to 14 words, urgent and punchy but strictly factual
- Standard Telugu (Eenadu/Sakshi quality); transliterate proper nouns (people, places, parties), do NOT translate them
- Do NOT invent facts, numbers, names, dates or places that are not in the input
- No clickbait or sensationalism beyond what the facts support
- Return ONLY the headline line

INPUT:
${fullText}`,
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
