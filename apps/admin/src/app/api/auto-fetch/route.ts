import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { buildSlugFromTitle, uniqueSlug } from "@/lib/slug";
import { uploadImageFromUrl } from "@/lib/blob";

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
              content: `You are a Telugu news editor for Rayalaseema Express newspaper. Convert the given English news into a Telugu newspaper article.

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

// Generate URL slug from title — delegates to shared sanitizer + uniqueness helper.
function generateSlug(title: string, existingSlugs: Set<string>): string {
  const base = buildSlugFromTitle(title);
  const final = uniqueSlug(base, existingSlugs);
  existingSlugs.add(final);
  return final;
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]); if (isAuthError(session)) return session;
  if (!NEWSDATA_KEY) return NextResponse.json({ error: "NEWSDATA_API_KEY not configured" }, { status: 503 });
  const {
    categories: requestedCategories,
    // forceReimport=true → for every NewsData hit whose sourceUrl already
    // exists in Content (live OR soft-deleted), hard-delete the existing
    // row first and re-create. Lets editors refresh a category after
    // trashing earlier imports without manually purging trash.
    forceReimport,
  } = await req.json().catch(() => ({ categories: null, forceReimport: false }));

  // Which categories to fetch
  const categoriesToFetch = requestedCategories
    ? Object.keys(categoryQueries).filter((k) => requestedCategories.includes(k))
    : Object.keys(categoryQueries);

  // Get admin user for author
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) return NextResponse.json({ error: "No admin user" }, { status: 500 });

  // Existing slugs + source URLs across ALL Content rows including trashed.
  // The DB unique indexes on (slug) and (sourceUrl) span every row regardless
  // of soft-delete state, so dedup must too. The prisma client extension
  // (packages/db/src/index.ts) auto-injects `deletedAt: null` on findMany,
  // hiding trashed rows from the default query — we work around it by
  // running a second findMany with an EXPLICIT deletedAt filter (any
  // explicit deletedAt key in where bypasses the auto-inject) and merging.
  const [activeItems, trashedItems] = await Promise.all([
    prisma.content.findMany({ select: { slug: true, sourceUrl: true } }),
    prisma.content.findMany({
      where: { deletedAt: { not: null } },
      select: { slug: true, sourceUrl: true },
    }),
  ]);
  const existingItems = [...activeItems, ...trashedItems];
  const existingSlugs = new Set(existingItems.map((a) => a.slug).filter(Boolean) as string[]);
  const existingSourceSet = new Set(existingItems.map((a) => a.sourceUrl).filter(Boolean));

  // Get category IDs
  const dbCategories = await prisma.category.findMany();
  const categoryMap: Record<string, string> = {};
  dbCategories.forEach((c) => (categoryMap[c.slug] = c.id));

  const results: { category: string; fetched: number; published: number; error?: string }[] = [];
  let totalPublished = 0;

  for (const catSlug of categoriesToFetch) {
    const config = categoryQueries[catSlug];
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

        // Translate to Telugu
        let translated;
        try {
          translated = await translateToTelugu(article.title, content);
        } catch (e) {
          // If translation fails, use original
          translated = { title: article.title, summary: content.substring(0, 200), body: `<p>${content}</p>` };
        }
        const slug = generateSlug(article.title, existingSlugs);

        // Re-host source image on Azure Blob (publishers block hotlinking).
        // Image is OPTIONAL — articles without one still import; admin can
        // attach a stock image later via the editor's image-search modal.
        const hostedImage = article.image_url ? await uploadImageFromUrl(article.image_url) : null;

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
            // sourceUrl collision — article already in DB (possibly soft-
            // deleted, hence missed by our dedup set). Skip silently;
            // editor can restore the trashed row if they want it back.
            if (msg.includes("Unique constraint") && msg.includes("sourceUrl")) {
              break;
            }
            throw e;
          }
        }
        if (!created) {
          // Three retries exhausted — skip this article rather than throwing
          // (don't want one bad slug to abort the whole category batch).
          continue;
        }
        if (article.link) existingSourceSet.add(article.link);

        published++;
        totalPublished++;

        // Small delay to not hit AI rate limits
        await new Promise((r) => setTimeout(r, 1000));
      }

      results.push({ category: catSlug, fetched: data.results.length, published });
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
