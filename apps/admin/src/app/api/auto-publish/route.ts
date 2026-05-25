import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { buildSlugFromTitle, sanitizeSlug } from "@/lib/slug";
import { uploadImageFromUrl } from "@/lib/blob";

const NEWSDATA_KEY = process.env.NEWSDATA_API_KEY;
const AI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AI_KEY = process.env.AZURE_OPENAI_KEY;
const AI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt51";
const AI_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

// Category keywords for auto-matching
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  politics: ["election", "minister", "MLA", "MP", "party", "TDP", "YSRCP", "BJP", "congress", "assembly", "parliament", "vote", "CM", "chief minister", "governor"],
  crime: ["arrest", "police", "murder", "theft", "robbery", "drug", "smuggling", "crime", "accused", "court", "jail", "FIR"],
  sports: ["cricket", "IPL", "football", "kabaddi", "match", "tournament", "player", "team", "win", "score", "olympic"],
  business: ["company", "market", "stock", "investment", "industry", "factory", "plant", "export", "GDP", "economy", "trade", "solar", "revenue"],
  entertainment: ["movie", "film", "actor", "actress", "cinema", "Tollywood", "Bollywood", "OTT", "Netflix", "song", "director"],
  education: ["school", "college", "university", "exam", "result", "student", "teacher", "EAMCET", "NEET", "JEE", "inter", "SSC", "degree"],
  agriculture: ["farmer", "crop", "irrigation", "rain", "harvest", "mango", "groundnut", "cotton", "paddy", "dam", "water", "drought"],
  "district-news": ["Kurnool", "Anantapur", "Kadapa", "Chittoor", "Tirupati", "Nandyal", "Rayalaseema", "mandal", "district", "collector"],
  national: ["India", "Delhi", "parliament", "supreme court", "Modi", "central", "union", "national"],
  international: ["US", "China", "Pakistan", "world", "global", "UN", "war", "international", "foreign"],
  technology: ["tech", "AI", "software", "app", "phone", "internet", "digital", "cyber", "startup", "IT"],
  health: ["hospital", "doctor", "health", "medicine", "COVID", "disease", "treatment", "surgery", "medical"],
  devotional: ["temple", "Tirupati", "Tirumala", "festival", "god", "puja", "darshan", "priest", "pilgrim"],
  jobs: ["job", "recruitment", "vacancy", "employment", "salary", "interview", "government job", "notification"],
  "movie-reviews": ["review", "rating", "box office", "collection", "hit", "flop", "release"],
  "exam-results": ["result", "topper", "marks", "rank", "cutoff", "merit", "pass percentage"],
  weather: ["weather", "rain", "cyclone", "temperature", "flood", "heat wave", "monsoon"],
  nri: ["NRI", "abroad", "Gulf", "USA", "UK", "Dubai", "Saudi", "overseas", "diaspora"],
  navyaseema: ["women", "girl", "mother", "health tips", "beauty", "recipe", "cooking", "fashion"],
  "real-estate": ["real estate", "property", "house", "flat", "apartment", "land", "construction"],
  editorial: ["opinion", "editorial", "analysis", "comment"],
  "rasi-phalalu": ["horoscope", "zodiac", "astrology", "rashi"],
};

// Match article to best category
function matchCategory(title: string, description: string, keywords: string[]): string {
  const text = `${title} ${description} ${keywords.join(" ")}`.toLowerCase();
  let bestMatch = "district-news";
  let bestScore = 0;

  for (const [slug, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = words.filter((w) => text.includes(w.toLowerCase())).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = slug;
    }
  }
  return bestMatch;
}

// Scrape source URL for full content
async function scrapeSource(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 4000);
  } catch { return ""; }
}

// Translate to Telugu via GPT-5.1
async function translateToTelugu(title: string, content: string): Promise<{ title: string; summary: string; body: string }> {
  const res = await fetch(
    `${AI_ENDPOINT}openai/deployments/${AI_DEPLOYMENT}/chat/completions?api-version=${AI_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": AI_KEY || "" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `You are a Telugu newspaper translator. Translate English news to standard Telugu.
Return EXACTLY this JSON format (no markdown, no code blocks):
{"title":"Telugu title here","summary":"60 word Telugu summary here","body":"<h2>Telugu headline</h2><p>paragraph 1</p><p>paragraph 2</p><p>paragraph 3</p>"}
Rules: Pure Telugu except proper nouns. 300-400 words body. Professional newspaper style.`,
          },
          { role: "user", content: `Translate this news:\nTitle: ${title}\nContent: ${content}` },
        ],
        max_completion_tokens: 2000,
        temperature: 0.4,
        response_format: { type: "json_object" },
      }),
    }
  );
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("[auto-publish] JSON parse error:", e);
    // Fallback: extract from text
    return { title: title, summary: content.substring(0, 200), body: `<p>${content}</p>` };
  }
}

// POST /api/auto-publish - fetch, translate, and publish articles for all categories
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]); if (isAuthError(session)) return session;
  if (!NEWSDATA_KEY) return NextResponse.json({ error: "NEWSDATA_API_KEY not configured" }, { status: 503 });
  if (!AI_ENDPOINT || !AI_KEY) return NextResponse.json({ error: "AZURE_OPENAI not configured" }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get("dry") === "true";
  const maxPerCategory = parseInt(searchParams.get("max") || "3");
  const articleStatus = searchParams.get("status") === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const force = searchParams.get("force") === "true";

  const results: Record<string, unknown>[] = [];
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) return NextResponse.json({ error: "No admin user" }, { status: 400 });

  // Get categories (optionally filter by slug)
  const filterSlugs = searchParams.get("categories")?.split(",").filter(Boolean);
  const categories = await prisma.category.findMany({
    where: { active: true, ...(filterSlugs ? { slug: { in: filterSlugs } } : {}) },
    orderBy: { sortOrder: "asc" },
  });

  // Count existing published Content (type=ARTICLE) per category. Spec #1 (#109):
  // auto-publish now writes Content rows; existing count must read from the
  // same table so the "enough already" gate doesn't double up.
  const categoryCounts = await prisma.content.groupBy({
    by: ["categoryId"],
    where: { type: "ARTICLE", status: "PUBLISHED" },
    _count: { id: true },
  });
  const existingCounts: Record<string, number> = {};
  for (const cat of categories) {
    const found = categoryCounts.find((c) => c.categoryId === cat.id);
    existingCounts[cat.slug] = found?._count.id || 0;
  }

  // Search queries per category for NewsData
  const searchQueries: Record<string, string> = {
    politics: "Andhra Pradesh politics",
    crime: "Andhra Pradesh crime police",
    sports: "IPL cricket India sports",
    business: "Andhra Pradesh industry business",
    entertainment: "Telugu cinema Tollywood movie",
    education: "Andhra Pradesh education exam results",
    agriculture: "Andhra Pradesh agriculture farmer",
    "district-news": "Kurnool Anantapur Kadapa Tirupati Chittoor",
    national: "India national news Modi parliament",
    international: "world international news",
    technology: "technology AI smartphone India",
    health: "health medical hospital India",
    devotional: "Tirupati temple festival Hindu",
    jobs: "government jobs recruitment Andhra Pradesh",
    "movie-reviews": "Telugu movie review box office",
    "exam-results": "exam results AP SSC inter EAMCET",
    weather: "Andhra Pradesh weather rain cyclone",
    nri: "NRI Telugu Gulf USA",
    navyaseema: "women health recipe cooking India",
    "real-estate": "real estate property Andhra Pradesh",
    editorial: "Andhra Pradesh opinion analysis development",
    "rasi-phalalu": "horoscope zodiac today astrology",
  };

  for (const cat of categories) {
    const existing = existingCounts[cat.slug] || 0;
    const needed = force ? maxPerCategory : Math.max(0, maxPerCategory - existing);
    if (needed === 0) {
      results.push({ category: cat.nameEn, slug: cat.slug, existing, needed: 0, created: 0, status: "sufficient" });
      continue;
    }

    // Fetch news for this category
    const query = searchQueries[cat.slug] || cat.nameEn || "Andhra Pradesh";
    let newsArticles: any[] = [];
    try {
      const newsRes = await fetch(
        `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_KEY}&q=${encodeURIComponent(query)}&language=en&size=10`
      );
      const newsData = await newsRes.json();
      newsArticles = newsData.results || [];
    } catch (e) {
      results.push({ category: cat.nameEn, slug: cat.slug, error: "News fetch failed" });
      continue;
    }

    // Batch dedup by source URL — the stable, reliable key. Read from Content
    // table (Spec #1 #109) so the same wire story can't get ingested twice.
    const sourceUrls = newsArticles.slice(0, needed).map((n: any) => n.link).filter(Boolean);
    const existingBySource = sourceUrls.length > 0 ? await prisma.content.findMany({
      where: { sourceUrl: { in: sourceUrls } },
      select: { sourceUrl: true },
    }) : [];
    const existingSourceSet = new Set(existingBySource.map((a) => a.sourceUrl));

    let created = 0;
    for (const news of newsArticles.slice(0, needed)) {
      if (!news.title || !news.description) continue;

      // Skip if this exact source article already imported
      if (news.link && existingSourceSet.has(news.link)) continue;

      try {
        // Scrape full content from source
        let fullContent = news.description || "";
        if (news.link) {
          const scraped = await scrapeSource(news.link);
          if (scraped.length > 200) fullContent = scraped;
        }

        if (dryRun) {
          results.push({ category: cat.nameEn, title: news.title, image: news.image_url, status: "dry-run" });
          created++;
          continue;
        }

        // Translate to Telugu
        const translated = await translateToTelugu(news.title, fullContent);

        // Re-host source image on Azure Blob (publishers block hotlinking)
        const hostedImage = await uploadImageFromUrl(news.image_url);

        // Create slug — sanitized + timestamp for uniqueness
        const slug = sanitizeSlug(`${buildSlugFromTitle(news.title)}-${Date.now()}`);

        // Create Content row (Spec #1 #109). type=ARTICLE preserves prior
        // behaviour — auto-fetched wire stories are always articles, never
        // videos/reels/etc.
        await prisma.content.create({
          data: {
            type: "ARTICLE",
            title: translated.title || news.title,
            slug,
            summary: translated.summary || news.description?.substring(0, 200),
            body: translated.body || `<p>${news.description}</p>`,
            featuredImage: hostedImage,
            sourceUrl: news.link || null,
            language: "TELUGU",
            status: articleStatus,
            featured: false,
            authorId: admin.id,
            categoryId: cat.id,
            publishedAt: articleStatus === "PUBLISHED" ? new Date() : null,
          },
        });
        if (news.link) existingSourceSet.add(news.link);
        created++;
        results.push({ category: cat.nameEn, title: translated.title, image: !!news.image_url, status: articleStatus.toLowerCase() });
      } catch (e: any) {
        results.push({ category: cat.nameEn, title: news.title, error: e.message, status: "failed" });
      }
    }

    results.push({ category: cat.nameEn, slug: cat.slug, existing, needed, created, status: "done" });
  }

  return NextResponse.json({
    total: results.filter((r) => r.status === articleStatus.toLowerCase()).length,
    results,
  });
}

// GET - show status
export async function GET() {
  const session = await requireAuth(["ADMIN"]); if (isAuthError(session)) return session;
  const categories = await prisma.category.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { articles: true } } },
  });

  return NextResponse.json(
    categories.map((c) => ({
      name: c.nameEn,
      slug: c.slug,
      articles: c._count.articles,
      needsMore: c._count.articles < 3,
    }))
  );
}
