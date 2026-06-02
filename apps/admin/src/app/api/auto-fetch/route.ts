import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { uploadImageFromUrlWithMeta } from "@/lib/blob";
import { runPipeline } from "@/lib/ai/pipeline";
import { AIContentFilterError } from "@/lib/ai/client";
import {
  ArticleBlockedByFilter,
  RawArticle,
  generateSlug,
  importOneArticle,
  loadImportPrelude,
} from "@/lib/news-import";

const NEWSDATA_KEY = process.env.NEWSDATA_API_KEY;
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || "https://rayalaseema-ai.openai.azure.com/";
const AZURE_KEY = process.env.AZURE_OPENAI_KEY || "";
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt51";
const AZURE_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

// Category → search query mapping (Telugu news focus)
const categoryQueries: Record<string, { q: string; newsCategory?: string }> = {
  "politics": { q: "Andhra Pradesh politics OR Rayalaseema OR AP CM", newsCategory: "politics" },
  "crime": { q: "Andhra Pradesh crime OR Kurnool crime OR Kadapa crime", newsCategory: "crime" },
  "sports": { q: "IPL OR cricket India OR sports Telugu", newsCategory: "sports" },
  "business": { q: "Andhra Pradesh business OR India economy OR stock market", newsCategory: "business" },
  "entertainment": { q: "Telugu cinema OR Tollywood OR Telugu movie", newsCategory: "entertainment" },
  "education": { q: "AP education OR exam results OR EAMCET OR Inter results Andhra", newsCategory: "education" },
  "agriculture": { q: "Andhra Pradesh agriculture OR farming OR mandi prices AP", newsCategory: "food" },
  "national": { q: "India national news", newsCategory: "politics" },
  "international": { q: "world news international", newsCategory: "world" },
  "technology": { q: "technology India OR AI OR smartphone", newsCategory: "technology" },
  "health": { q: "health India OR medical OR hospital Andhra Pradesh", newsCategory: "health" },
  "district-news": { q: "Kurnool OR Anantapur OR Kadapa OR Tirupati OR Chittoor OR Nandyal" },
  // Missing categories
  "devotional": { q: "Hindu temple India OR Tirupati OR pilgrimage India" },
  "jobs": { q: "government jobs India OR UPSC OR AP jobs recruitment 2026" },
  "movie-reviews": { q: "Telugu movie OR Tollywood OR Bollywood movie review", newsCategory: "entertainment" },
  "exam-results": { q: "exam results India OR university results OR board results", newsCategory: "education" },
  "nri": { q: "Indian diaspora OR Indians USA OR NRI OR Indian abroad", newsCategory: "world" },
  "navyaseema": { q: "Andhra Pradesh development OR Rayalaseema development OR new projects AP" },
  "real-estate": { q: "real estate India OR property prices Hyderabad OR housing India" },
  "editorial": { q: "India analysis opinion OR Indian politics analysis OR economy analysis India" },
  "rasi-phalalu": { q: "horoscope today OR zodiac OR astrology prediction" },
  "weather": { q: "India weather forecast OR cyclone India OR monsoon Andhra Pradesh" },
  // Cinema + entertainment sub-sections
  "tollywood": { q: "Tollywood OR Telugu cinema OR Telugu movie OR Telugu film", newsCategory: "entertainment" },
  "bollywood": { q: "Bollywood OR Hindi cinema OR Hindi movie OR Hindi film", newsCategory: "entertainment" },
  "hollywood": { q: "Hollywood OR English movie OR Hollywood film", newsCategory: "entertainment" },
  "south-cinema": { q: "South Indian cinema OR Tamil movie OR Kannada movie OR Malayalam movie OR Telugu movie", newsCategory: "entertainment" },
  "ott": { q: "OTT OR Netflix OR Amazon Prime OR web series OR streaming", newsCategory: "entertainment" },
  "tv": { q: "television OR TV serial OR TV show India OR reality show", newsCategory: "entertainment" },
  // Sports sub-sections
  "cricket": { q: "cricket OR India cricket OR Test match OR ODI OR T20", newsCategory: "sports" },
  "ipl": { q: "IPL OR Indian Premier League OR cricket league", newsCategory: "sports" },
  // Business + money sub-sections
  "market": { q: "stock market OR Sensex OR Nifty OR share market India", newsCategory: "business" },
  "economy": { q: "India economy OR GDP OR inflation OR RBI OR economic policy", newsCategory: "business" },
  "corporate": { q: "corporate India OR company results OR business deal OR startup India", newsCategory: "business" },
  "personal-finance": { q: "personal finance OR mutual funds OR income tax OR savings India", newsCategory: "business" },
  "automobile": { q: "car launch India OR automobile OR electric vehicle OR two wheeler India", newsCategory: "business" },
  // Regional states
  "andhra-pradesh": { q: "Andhra Pradesh OR Amaravati OR AP government OR Chandrababu OR Jagan", newsCategory: "politics" },
  "telangana": { q: "Telangana OR Hyderabad OR Telangana government OR Revanth Reddy", newsCategory: "politics" },
  "tamil-nadu": { q: "Tamil Nadu OR Chennai OR Stalin OR TN government", newsCategory: "politics" },
  "karnataka": { q: "Karnataka OR Bengaluru OR Karnataka government", newsCategory: "politics" },
  // Lifestyle / people / food / youth / social
  "lifestyle": { q: "lifestyle OR fashion OR wellness OR health tips", newsCategory: "lifestyle" },
  "vasundhara": { q: "women OR women empowerment OR fashion OR beauty OR wellness", newsCategory: "lifestyle" },
  "recipes": { q: "recipe OR cooking OR food dish OR culinary", newsCategory: "food" },
  "rayalaseema-ruchulu": { q: "Andhra recipe OR Telugu food OR South Indian cuisine OR Rayalaseema food", newsCategory: "food" },
  "youth": { q: "youth OR students OR campus OR career OR competitive exams India", newsCategory: "education" },
  "social-media": { q: "social media OR viral OR Instagram OR YouTube OR trending India", newsCategory: "technology" },
  // General-interest sections (sparser - little dedicated wire coverage)
  "vintalu-visheshalu": { q: "amazing facts OR strange news OR did you know OR weird news", newsCategory: "other" },
  "explained": { q: "explainer OR explained OR analysis India", newsCategory: "top" },
  "fact-check": { q: "fact check OR fake news OR misinformation OR debunked India", newsCategory: "top" },
  "good-news": { q: "good news OR positive news OR inspiring story India", newsCategory: "top" },
  "features": { q: "feature story OR human interest OR profile India", newsCategory: "top" },
  "funday": { q: "trivia OR fun facts OR amazing facts OR quiz", newsCategory: "other" },
  "guest-columns": { q: "opinion OR column OR analysis India", newsCategory: "top" },
  "cartoon": { q: "political cartoon OR editorial cartoon OR comic", newsCategory: "other" },
  "calendar-panchangam": { q: "Hindu festival OR Panchangam OR Telugu festival OR auspicious dates", newsCategory: "other" },
  "obituaries": { q: "obituary OR passed away OR veteran died India", newsCategory: "top" },
  "puzzles": { q: "puzzle OR crossword OR brain teaser OR sudoku", newsCategory: "other" },
  "reader-letters": { q: "letters to the editor OR reader opinion", newsCategory: "top" },
  "podcasts": { q: "podcast OR audio show India", newsCategory: "technology" },
  "sunday-magazine": { q: "Sunday magazine OR weekend read OR long read India", newsCategory: "top" },
  "hai-bujji": { q: "children OR kids stories OR moral stories", newsCategory: "other" },
  "yetteta": { q: "humor OR satire OR funny news India", newsCategory: "other" },
  // District-specific (mapped to district-news category but tagged to districts)
  "district-kurnool": { q: "Kurnool district Andhra Pradesh" },
  "district-nandyal": { q: "Nandyal district Andhra Pradesh" },
  "district-ananthapuramu": { q: "Anantapur district Andhra Pradesh OR Kia Motors Anantapur" },
  "district-kadapa": { q: "Kadapa district Andhra Pradesh OR YSR district" },
  "district-tirupati": { q: "Tirupati temple OR Tirupati district" },
  "district-chittoor": { q: "Chittoor district Andhra Pradesh" },
  "district-sri-sathya-sai": { q: "Puttaparthi OR Sri Sathya Sai district Andhra Pradesh" },
  "district-annamayya": { q: "Annamayya district OR Rayachoti OR Rajampet Andhra Pradesh" },
};

// Translate English to Telugu using Azure OpenAI
async function translateToTelugu(title: string, content: string): Promise<{ title: string; summary: string; body: string }> {
  if (!AZURE_KEY) return { title, summary: content.substring(0, 200), body: `<p>${content}</p>` };

  try {
    const res = await fetch(
      `${AZURE_ENDPOINT}openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${AZURE_VERSION}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": AZURE_KEY },
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: `You are a Telugu news editor for Rayalaseema News newspaper. Convert the given English news into a Telugu newspaper article.

OUTPUT FORMAT (strictly follow):
TITLE: [Telugu headline - max 15 words, catchy]
SUMMARY: [Telugu summary - exactly 2 sentences, max 50 words]
BODY: [Telugu article body in HTML - 3-4 paragraphs using <p> tags, 150-250 words]

RULES:
- Write in standard Telugu (Eenadu/Sakshi quality)
- NO English words except proper nouns
- Keep facts accurate
- Write like a human journalist
- NEVER add your own opinions or analysis beyond what's in the source`
            },
            { role: "user", content: `Title: ${title}\n\nContent: ${content}` },
          ],
          max_completion_tokens: 1500,
          temperature: 0.5,
        }),
      }
    );

    const data = await res.json();
    const result = data.choices?.[0]?.message?.content || "";

    // Parse the structured output
    const titleMatch = result.match(/TITLE:\s*(.+)/);
    const summaryMatch = result.match(/SUMMARY:\s*([\s\S]+?)(?=\nBODY:|$)/);
    const bodyMatch = result.match(/BODY:\s*([\s\S]+)/);

    return {
      title: titleMatch?.[1]?.trim() || title,
      summary: summaryMatch?.[1]?.trim() || content.substring(0, 200),
      body: bodyMatch?.[1]?.trim() || `<p>${content}</p>`,
    };
  } catch (e) {
    console.error("[auto-fetch] Translation error:", e);
    return { title, summary: content.substring(0, 200), body: `<p>${content}</p>` };
  }
}

// importOneArticle, RawArticle, generateSlug, ArticleBlockedByFilter,
// loadImportPrelude all live in @/lib/news-import - shared with the PTI
// route so the Eenadu-grade pipeline + dedup + slug retries stay consistent
// across every wire source.

// Two-phase API. Phase 1 (action="preview") fetches NewsData and returns
// articles with dedup flags without importing anything. Phase 2 (action=
// "import" or articles[] provided) imports a caller-curated list.
// Backward-compat: old shape { categories, forceReimport? } still works and
// behaves like "fetch + auto-import everything" - the modal's bulk mode.
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]); if (isAuthError(session)) return session;
  if (!NEWSDATA_KEY) return NextResponse.json({ error: "NEWSDATA_API_KEY not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const {
    action,
    categories: requestedCategories,
    articles: pickedArticles,
    // forceReimport=true → for every sourceUrl already in Content (live OR
    // soft-deleted), hard-delete the existing row before re-creating.
    forceReimport,
    // Step 2 refine controls - all map to NewsData.io query params.
    // cursors keyed by category for per-category "Load more" pagination.
    keywordOverride,
    fromDate,
    toDate,
    domain,
    cursors,
  } = body as {
    action?: "preview" | "import";
    categories?: string[] | null;
    articles?: Array<RawArticle & { categorySlug: string }>;
    forceReimport?: boolean;
    keywordOverride?: string;
    fromDate?: string;
    toDate?: string;
    domain?: string;
    cursors?: Record<string, string>;
  };

  // Which categories to fetch
  const categoriesToFetch = requestedCategories
    ? Object.keys(categoryQueries).filter((k) => requestedCategories.includes(k))
    : Object.keys(categoryQueries);

  // Shared prelude - admin author, categorySlug→id map, dedup sets.
  let admin: { id: string };
  let categoryMap: Record<string, string>;
  let existingSlugs: Set<string>;
  let existingSourceSet: Set<unknown>;
  try {
    ({ admin, categoryMap, existingSlugs, existingSourceSet } = await loadImportPrelude());
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Prelude load failed" }, { status: 500 });
  }

  // Phase 1 - preview. Pull NewsData hits for each selected category and
  // return them WITHOUT importing. Each result is flagged `alreadyImported`
  // so the picker UI can dim / pre-uncheck them.
  if (action === "preview") {
    const previews: Array<{
      category: string;
      results: Array<RawArticle & { alreadyImported: boolean }>;
      nextPageCursor?: string;
      error?: string;
    }> = [];
    const trimmedKeyword = (keywordOverride || "").trim();
    for (const catSlug of categoriesToFetch) {
      // Categories the admin added in /categories aren't in our curated
      // categoryQueries map - fall back to using the slug itself (cleaned
      // of district- prefix and dashes) as the NewsData search query.
      const config = categoryQueries[catSlug] || {
        q: catSlug.replace(/^district-/, "").replace(/-/g, " "),
      };
      // Modal "Refine" bar - if a keyword override is set, it wins over
      // the curated per-category query. Otherwise each category keeps
      // its tuned q-string. Date / domain / pagination params are passed
      // through to NewsData when present.
      const effectiveQ = trimmedKeyword || config.q;
      try {
        let url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=${encodeURIComponent(effectiveQ)}&language=en,te&size=10`;
        if (config.newsCategory && !trimmedKeyword) url += `&category=${config.newsCategory}`;
        if (fromDate) url += `&from_date=${encodeURIComponent(fromDate)}`;
        if (toDate) url += `&to_date=${encodeURIComponent(toDate)}`;
        if (domain) url += `&domain=${encodeURIComponent(domain.trim())}`;
        const cursor = cursors?.[catSlug];
        if (cursor) url += `&page=${encodeURIComponent(cursor)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status !== "success") {
          previews.push({ category: catSlug, results: [], error: data.message || "NewsData error" });
          continue;
        }
        const out = (data.results as RawArticle[] || []).map((a) => ({
          ...a,
          alreadyImported: !!(a.link && existingSourceSet.has(a.link)),
        }));
        previews.push({
          category: catSlug,
          results: out,
          nextPageCursor: data.nextPage || undefined,
        });
      } catch (e: any) {
        previews.push({ category: catSlug, results: [], error: e?.message || "fetch error" });
      }
    }
    return NextResponse.json({ preview: previews });
  }

  const results: { category: string; fetched: number; published: number; blocked?: number; error?: string }[] = [];
  let totalPublished = 0;

  // Phase 2 - import a curated list. Skip the NewsData fetch entirely; the
  // caller already picked the articles in the preview step.
  if (Array.isArray(pickedArticles) && pickedArticles.length > 0) {
    // Group by category so we share the same constituency lookup per group.
    const byCat = new Map<string, typeof pickedArticles>();
    for (const a of pickedArticles) {
      if (!byCat.has(a.categorySlug)) byCat.set(a.categorySlug, []);
      byCat.get(a.categorySlug)!.push(a);
    }
    for (const [catSlug, list] of byCat) {
      const actualCatSlug = catSlug.startsWith("district-") ? "district-news" : catSlug;
      const categoryId = categoryMap[actualCatSlug];
      if (!categoryId) { results.push({ category: catSlug, fetched: list.length, published: 0, error: "Category not found" }); continue; }
      let constituencyId: string | undefined;
      if (catSlug.startsWith("district-")) {
        const districtSlug = catSlug.replace("district-", "");
        const district = await prisma.district.findUnique({ where: { slug: districtSlug }, include: { constituencies: { take: 1 } } });
        constituencyId = district?.constituencies[0]?.id;
      }
      let published = 0;
      let blocked = 0;
      const blockedCategories = new Set<string>();
      for (const article of list) {
        try {
          const ok = await importOneArticle(article, categoryId, constituencyId, existingSourceSet, existingSlugs, admin.id, !!forceReimport);
          if (ok) { published++; totalPublished++; }
        } catch (e) {
          if (e instanceof ArticleBlockedByFilter) {
            blocked++;
            for (const c of e.categories) blockedCategories.add(c);
          } else {
            throw e;
          }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      const blockedNote = blocked > 0
        ? `${blocked} blocked by AI content filter${blockedCategories.size ? ` (${[...blockedCategories].join(", ")})` : ""}`
        : undefined;
      results.push({ category: catSlug, fetched: list.length, published, blocked: blocked || undefined, error: blockedNote });
    }
    return NextResponse.json({
      success: true,
      totalPublished,
      results,
      message: `Imported ${totalPublished} of ${pickedArticles.length} selected article${pickedArticles.length === 1 ? "" : "s"}`,
    });
  }

  for (const catSlug of categoriesToFetch) {
    // Same fallback as the preview branch - admin-created categories.
    const config = categoryQueries[catSlug] || {
      q: catSlug.replace(/^district-/, "").replace(/-/g, " "),
    };
    // District queries use district-news category
    const actualCatSlug = catSlug.startsWith("district-") ? "district-news" : catSlug;
    const categoryId = categoryMap[actualCatSlug];
    if (!categoryId) { results.push({ category: catSlug, fetched: 0, published: 0, error: "Category not found" }); continue; }

    // Get constituency for district tagging
    let constituencyId: string | undefined;
    if (catSlug.startsWith("district-")) {
      const districtSlug = catSlug.replace("district-", "");
      const district = await prisma.district.findUnique({ where: { slug: districtSlug }, include: { constituencies: { take: 1 } } });
      constituencyId = district?.constituencies[0]?.id;
    }

    try {
      // Fetch 5 articles per category (uses 1 API credit per call)
      let url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=${encodeURIComponent(config.q)}&language=en,te&size=10&image=1`;
      if (config.newsCategory) url += `&category=${config.newsCategory}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.status !== "success" || !data.results?.length) {
        results.push({ category: catSlug, fetched: 0, published: 0, error: data.message || "No results" });
        continue;
      }

      let published = 0;
      let blocked = 0;
      const blockedCategories = new Set<string>();

      for (const article of data.results) {
        const content = article.content || article.description || article.title || "";
        if (!article.title || content.length < 20) continue;

        // Dedup. If sourceUrl already exists in Content (live or trashed),
        // either skip (default) or hard-delete + recreate (forceReimport).
        if (article.link && existingSourceSet.has(article.link)) {
          if (!forceReimport) continue;
          // Purge the existing row so this article can be re-imported fresh.
          // Bypass the soft-delete extension by querying with explicit
          // deletedAt filter (any explicit deletedAt key disables the
          // auto-injected `deletedAt: null` filter).
          const existing = await prisma.content.findFirst({
            where: { sourceUrl: article.link, deletedAt: { not: undefined } },
            select: { id: true, slug: true },
          });
          if (existing) {
            await prisma.content.delete({ where: { id: existing.id } });
            existingSourceSet.delete(article.link);
            if (existing.slug) existingSlugs.delete(existing.slug);
          }
        }

        // Translate to Telugu via the Eenadu-grade pipeline. Same path as
        // importOneArticle - kept inlined here so the bulk-all branch
        // produces identical quality copy to the curated-picker branch.
        let translated;
        try {
          const r = await runPipeline(`${article.title}\n\n${content}`);
          // body_html_te already opens with <p class="dek"> per compose
          // HTML rule. Don't double-prepend.
          translated = {
            title: r.article.title_te || article.title,
            summary: r.article.summary_te || content.substring(0, 200),
            body: r.article.body_html_te,
          };
        } catch (e) {
          // Azure content filter - skip the article entirely so the
          // review queue stays clean. Other failures fall through to the
          // English placeholder so the editor can manually translate.
          if (e instanceof AIContentFilterError) {
            console.warn("[auto-fetch] content filter blocked:", e.categories.join(", "));
            blocked++;
            for (const c of e.categories) blockedCategories.add(c);
            continue;
          }
          console.error("[auto-fetch] pipeline failed:", e);
          translated = { title: article.title, summary: content.substring(0, 200), body: `<p>${content}</p>` };
        }
        const slug = generateSlug(article.title, existingSlugs);

        // Re-host source image on Azure Blob (publishers block hotlinking).
        // Image is OPTIONAL - articles without one still import; admin can
        // attach a stock image later via the editor's image-search modal.
        // Skip tiny thumbnails as the hero - they look blurry shown large.
        // Import without a hero rather than publish a blurry one (>=800px, or
        // unknown width when sharp couldn't measure it).
        const heroImg = article.image_url ? await uploadImageFromUrlWithMeta(article.image_url) : null;
        const hostedImage = heroImg && (heroImg.width === 0 || heroImg.width >= 800) ? heroImg.url : null;

        // Create Content row (Spec #1 #109). DRAFT so editors can review.
        //
        // Slug-collision retry: the existingSlugs set built at line 129 only
        // covers non-soft-deleted rows (the prisma client extension filters
        // deletedAt: null). DB unique index spans ALL rows incl trash, so a
        // previously-trashed row with the same slug fails the constraint.
        // Two retries with timestamp suffix cover the gap.
        let finalSlug = slug;
        let created = false;
        for (let attempt = 0; attempt < 3 && !created; attempt++) {
          try {
            await prisma.content.create({
              data: {
                type: "ARTICLE",
                title: translated.title,
                slug: finalSlug,
                summary: translated.summary,
                body: translated.body,
                categoryId,
                authorId: admin.id,
                featuredImage: hostedImage,
                sourceUrl: article.link || null,
                status: "DRAFT",
                featured: false,
                language: "TELUGU",
                publishedAt: null,
                constituencyId: constituencyId || null,
              },
            });
            created = true;
          } catch (e: any) {
            const msg = String(e?.message || "");
            if (msg.includes("Unique constraint") && msg.includes("slug")) {
              finalSlug = `${slug}-${Date.now()}-${attempt + 1}`;
              continue;
            }
            // sourceUrl collision - article already in DB (possibly soft-
            // deleted, hence missed by our dedup set). Skip silently;
            // editor can restore the trashed row if they want it back.
            if (msg.includes("Unique constraint") && msg.includes("sourceUrl")) {
              break;
            }
            throw e;
          }
        }
        if (!created) {
          // Three retries exhausted - skip this article rather than throwing
          // (don't want one bad slug to abort the whole category batch).
          continue;
        }
        if (article.link) existingSourceSet.add(article.link);

        published++;
        totalPublished++;

        // Small delay to not hit AI rate limits
        await new Promise((r) => setTimeout(r, 1000));
      }

      const blockedNote = blocked > 0
        ? `${blocked} blocked by AI content filter${blockedCategories.size ? ` (${[...blockedCategories].join(", ")})` : ""}`
        : undefined;
      results.push({ category: catSlug, fetched: data.results.length, published, blocked: blocked || undefined, error: blockedNote });
    } catch (err: any) {
      results.push({ category: catSlug, fetched: 0, published: 0, error: err.message });
    }
  }

  return NextResponse.json({
    success: true,
    totalPublished,
    results,
    message: `Published ${totalPublished} articles across ${results.filter((r) => r.published > 0).length} categories`,
  });
}
