import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { sanitizeSlug } from "@/lib/slug";
import { resolveDeskId } from "@/lib/desk-resolver";

// GET /api/articles - list with search, pagination, filters
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "15");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const category = searchParams.get("category") || "";
    const offset = (page - 1) * limit;

    // `?ids=a,b,c` short-circuits the listing — returns just those rows
    // (used by the e-paper editor to look up article titles by id).
    const idsParam = searchParams.get("ids");
    if (idsParam) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
      const articles = await prisma.article.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, slug: true, summary: true, featuredImage: true },
      });
      return NextResponse.json({ articles, total: articles.length });
    }

    const where: any = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status) where.status = status;
    if (category) where.categoryId = category;

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        include: {
          category: { select: { name: true, nameEn: true, slug: true, color: true } },
          author: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.article.count({ where }),
    ]);

    return NextResponse.json({ articles, total, page, limit });
  } catch (error) {
    return apiError(error);
  }
}

// POST /api/articles - create new article
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const authorId = session.user.id;

    const body = await req.json();
    const { title, slug, summary, body: articleBody, categoryId, featuredImage, status, featured, breaking, constituencyId, deskId, scheduledAt, tagNames, metaTitle, metaDescription, ogImage } = body;

    if (!title || !title.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if (!slug || !slug.trim()) return NextResponse.json({ error: "Slug is required" }, { status: 400 });
    if (!categoryId) return NextResponse.json({ error: "Category is required" }, { status: 400 });

    const cleanSlug = sanitizeSlug(slug);
    if (!cleanSlug) return NextResponse.json({ error: "Slug must contain at least one alphanumeric character" }, { status: 400 });

    const existing = await prisma.article.findUnique({ where: { slug: cleanSlug } });
    if (existing) return NextResponse.json({ error: "Slug already exists" }, { status: 400 });

    // Scheduling logic: future scheduledAt + status SCHEDULED keeps article hidden until cron flips it.
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduledDate && isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
    }
    let finalStatus = status || "DRAFT";
    if (scheduledDate && scheduledDate.getTime() > Date.now()) {
      finalStatus = "SCHEDULED";
    } else if (finalStatus === "SCHEDULED" && (!scheduledDate || scheduledDate.getTime() <= Date.now())) {
      return NextResponse.json({ error: "SCHEDULED status requires a future scheduledAt date" }, { status: 400 });
    }

    const resolvedDeskId = await resolveDeskId({
      deskId: deskId || null,
      categoryId,
      constituencyId: constituencyId || null,
    });

    const article = await prisma.article.create({
      data: {
        title: title.trim(),
        slug: cleanSlug,
        summary: summary?.trim() || null,
        body: articleBody || "",
        categoryId,
        featuredImage: featuredImage?.trim() || null,
        status: finalStatus,
        featured: featured || false,
        breaking: breaking || false,
        constituencyId: constituencyId || null,
        deskId: resolvedDeskId,
        language: "TELUGU",
        authorId,
        publishedAt: finalStatus === "PUBLISHED" ? new Date() : null,
        scheduledAt: scheduledDate,
        metaTitle: metaTitle?.trim() || null,
        metaDescription: metaDescription?.trim() || null,
        ogImage: ogImage?.trim() || null,
      },
    });

    // Attach tags (auto-create missing). tagNames = string[] of human-readable names.
    if (Array.isArray(tagNames) && tagNames.length > 0) {
      const slugify = (s: string) => s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 80);
      const seen = new Set<string>();
      for (const raw of tagNames) {
        const name = String(raw || "").trim();
        if (!name) continue;
        const tagSlug = slugify(name);
        if (!tagSlug || seen.has(tagSlug)) continue;
        seen.add(tagSlug);
        const tag = await prisma.tag.upsert({ where: { slug: tagSlug }, update: {}, create: { name, slug: tagSlug } });
        await prisma.articleTag.create({ data: { articleId: article.id, tagId: tag.id } }).catch(() => {});
      }
    }

    await logAudit({
      action: "article.create",
      resource: "article",
      resourceId: article.id,
      meta: { title: article.title, slug: article.slug, status: article.status, scheduledAt: article.scheduledAt },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json(article, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
