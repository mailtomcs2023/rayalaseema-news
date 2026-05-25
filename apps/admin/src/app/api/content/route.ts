// /api/content — unified content CRUD (Spec #1, issue #107).
// Replaces /api/articles + /api/videos + /api/reels + /api/stories +
// /api/galleries + /api/cartoons + /api/breaking-news once those are
// retired in Phase H (#131, #133).
//
// Validation: per-type payload Zod schemas live in @rayalaseema/db
// (packages/db/src/payload-schemas.ts). Bad payload → 400 with the
// field-level ZodError flattened.
import { NextRequest, NextResponse } from "next/server";
import { prisma, ContentType, safeValidatePayload } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { sanitizeSlug } from "@/lib/slug";
import { resolveDeskId } from "@/lib/desk-resolver";

const VALID_TYPES = Object.values(ContentType) as string[];

// GET /api/content — list with filters (type, status, category, search) + pagination
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "15");
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const status = searchParams.get("status") || "";
    const category = searchParams.get("category") || "";
    const offset = (page - 1) * limit;

    // `?ids=a,b,c` short-circuits — returns just those rows (lookup helper).
    const idsParam = searchParams.get("ids");
    if (idsParam) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
      const items = await prisma.content.findMany({
        where: { id: { in: ids } },
        select: { id: true, type: true, title: true, slug: true, summary: true, featuredImage: true },
      });
      return NextResponse.json({ items, total: items.length });
    }

    const where: any = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ];
    }
    if (type) {
      if (!VALID_TYPES.includes(type)) {
        return NextResponse.json({ error: `Invalid type '${type}'. Must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
      }
      where.type = type;
    }
    if (status) where.status = status;
    if (category) where.categoryId = category;

    const [items, total] = await Promise.all([
      prisma.content.findMany({
        where,
        include: {
          category: { select: { name: true, nameEn: true, slug: true, color: true } },
          author: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.content.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    return apiError(error);
  }
}

// POST /api/content — create new content row.
// Required: type, title.
// Optional everything else (slug, body, category, payload, etc.).
// Per-type defaults: BREAKING_NEWS starts SUBMITTED (skips Draft step); all
// other types default to DRAFT. Payload is Zod-validated against the chosen
// type's schema if provided.
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const authorId = session.user.id;
    const body = await req.json();

    const {
      type,
      title,
      slug,
      summary,
      body: contentBody,
      featuredImage,
      payload,
      categoryId,
      constituencyId,
      deskId,
      status,
      featured,
      scheduledAt,
      sourceUrl,
      tagNames,
      needsPibApproval,
    } = body;

    // Required validation.
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
    }
    if (!title || !title.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

    // Slug optional for BREAKING_NEWS (no public URL); required for everything else.
    // Sanitize + uniqueness check when present.
    let cleanSlug: string | null = null;
    if (slug && slug.trim()) {
      cleanSlug = sanitizeSlug(slug);
      if (!cleanSlug) return NextResponse.json({ error: "Slug must contain at least one alphanumeric character" }, { status: 400 });
      const existing = await prisma.content.findUnique({ where: { slug: cleanSlug } });
      if (existing) return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
    } else if (type !== ContentType.BREAKING_NEWS) {
      return NextResponse.json({ error: "Slug is required for this content type" }, { status: 400 });
    }

    // Validate payload shape against per-type Zod schema (if payload supplied).
    if (payload !== undefined && payload !== null) {
      const validation = safeValidatePayload(type as ContentType, payload);
      if (!validation.success) {
        return NextResponse.json({
          error: "Invalid payload shape",
          fieldErrors: validation.error.flatten().fieldErrors,
        }, { status: 400 });
      }
    }

    // Scheduling: future scheduledAt + status=SCHEDULED keeps content hidden until cron flips it.
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduledDate && isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
    }

    // Per-type default status. Breaking news goes straight to SUBMITTED so it
    // hits the review queue instantly (drafting a one-line ticker is pointless).
    let finalStatus = status || (type === ContentType.BREAKING_NEWS ? "SUBMITTED" : "DRAFT");
    if (scheduledDate && scheduledDate.getTime() > Date.now()) {
      finalStatus = "SCHEDULED";
    } else if (finalStatus === "SCHEDULED" && (!scheduledDate || scheduledDate.getTime() <= Date.now())) {
      return NextResponse.json({ error: "SCHEDULED status requires a future scheduledAt date" }, { status: 400 });
    }

    // Auto-resolve desk if not explicitly set. ARTICLE follows the same fallback
    // chain as before (manual → constituency → district → category → root).
    const resolvedDeskId = await resolveDeskId({
      deskId: deskId || null,
      categoryId: categoryId || null,
      constituencyId: constituencyId || null,
    });

    const content = await prisma.content.create({
      data: {
        type: type as ContentType,
        title: title.trim(),
        slug: cleanSlug,
        summary: summary?.trim() || null,
        body: contentBody || null,
        featuredImage: featuredImage?.trim() || null,
        payload: payload ?? undefined,
        categoryId: categoryId || null,
        authorId,
        deskId: resolvedDeskId,
        constituencyId: constituencyId || null,
        status: finalStatus as any,
        featured: featured ?? false,
        language: "TELUGU",
        sourceUrl: sourceUrl?.trim() || null,
        needsPibApproval: needsPibApproval ?? false,
        publishedAt: finalStatus === "PUBLISHED" ? new Date() : null,
        scheduledAt: scheduledDate,
      },
    });

    // Tags (auto-create missing). Same slugify rules as the legacy article API.
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
        await prisma.contentTag.create({ data: { contentId: content.id, tagId: tag.id } }).catch(() => {});
      }
    }

    await logAudit({
      action: "content.create",
      resource: "content",
      resourceId: content.id,
      meta: { type: content.type, title: content.title, slug: content.slug, status: content.status, scheduledAt: content.scheduledAt },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json(content, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
