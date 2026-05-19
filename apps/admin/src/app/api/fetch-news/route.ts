import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { buildSlugFromTitle, sanitizeSlug } from "@/lib/slug";

const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;

// GET /api/fetch-news - fetch latest news from NewsData.io
export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]); if (isAuthError(session)) return session;
  if (!NEWSDATA_API_KEY) return NextResponse.json({ error: "NEWSDATA_API_KEY not configured" }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "Rayalaseema OR Kurnool OR Anantapur OR Kadapa OR Tirupati OR Chittoor";
  const category = searchParams.get("category") || "";
  const language = searchParams.get("language") || "te,en";
  const size = Math.min(parseInt(searchParams.get("size") || "10"), 10).toString();

  try {
    let url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_API_KEY}&q=${encodeURIComponent(query)}&language=${language}&size=${size}`;
    if (category) url += `&category=${category}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "success") {
      return NextResponse.json({ error: "API error", details: data }, { status: 500 });
    }

    // Map to our format
    const articles = (data.results || []).map((r: any) => ({
      externalId: r.article_id,
      title: r.title,
      description: r.description,
      content: r.content,
      imageUrl: r.image_url,
      sourceUrl: r.link,
      source: r.source_id,
      language: r.language,
      category: r.category?.[0] || "general",
      publishedAt: r.pubDate,
      keywords: r.keywords || [],
    }));

    return NextResponse.json({
      total: data.totalResults,
      articles,
      nextPage: data.nextPage,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/fetch-news - import a news article as draft
export async function POST(req: NextRequest) {
  const session2 = await requireAuth(["ADMIN"]); if (isAuthError(session2)) return session2;
  try {
    const body = await req.json();
    const { title, description, imageUrl, sourceUrl, categorySlug } = body;

    if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

    // Find category or use default
    let categoryId: string;
    if (categorySlug) {
      const cat = await prisma.category.findUnique({ where: { slug: categorySlug } });
      categoryId = cat?.id || "";
    }
    if (!categoryId) {
      const defaultCat = await prisma.category.findFirst({ orderBy: { sortOrder: "asc" } });
      categoryId = defaultCat?.id || "";
    }

    // Find admin user as author
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });

    // Create slug from title — sanitized + timestamp for uniqueness
    const slug = sanitizeSlug(`${buildSlugFromTitle(title)}-${Date.now()}`);

    const article = await prisma.article.create({
      data: {
        title,
        slug,
        summary: description?.substring(0, 200) || null,
        body: `<p>${description || ""}</p>\n<p><em>Source: <a href="${sourceUrl}">${sourceUrl}</a></em></p>`,
        featuredImage: imageUrl || null,
        language: "TELUGU",
        status: "DRAFT",
        authorId: admin?.id || "",
        categoryId,
      },
    });

    return NextResponse.json(article, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
