import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit, diffSummary } from "@/lib/audit";
import { sanitizeSlug } from "@/lib/slug";
import { resolveDeskId } from "@/lib/desk-resolver";

// GET single article
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const article = await prisma.article.findUnique({
      where: { id },
      include: { category: true, author: true, tags: { include: { tag: true } } },
    });
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(article);
  } catch (error) {
    return apiError(error);
  }
}

// PUT update article
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    for (const key of ["title", "slug", "summary", "body", "categoryId", "featuredImage", "status", "featured", "breaking", "constituencyId", "deskId", "metaTitle", "metaDescription", "ogImage"] as const) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (!data.constituencyId) data.constituencyId = null;

    // Auto-resolve desk if category/constituency changed (or if no desk currently set).
    // If editor explicitly cleared deskId, treat as "reset to auto".
    const needsDeskResolve =
      body.deskId !== undefined ||
      body.categoryId !== undefined ||
      body.constituencyId !== undefined;
    if (needsDeskResolve) {
      const currentForDesk = await prisma.article.findUnique({
        where: { id },
        select: { categoryId: true, constituencyId: true, deskId: true },
      });
      const effectiveCategoryId = data.categoryId ?? currentForDesk?.categoryId ?? null;
      const effectiveConstituencyId = data.constituencyId ?? currentForDesk?.constituencyId ?? null;
      // body.deskId === null means "clear/auto"; undefined means "don't change" (use current)
      const effectiveDeskId = body.deskId === undefined ? currentForDesk?.deskId ?? null : body.deskId;
      data.deskId = await resolveDeskId({
        deskId: effectiveDeskId,
        categoryId: effectiveCategoryId,
        constituencyId: effectiveConstituencyId,
      });
    }

    // Sanitize slug if present in update payload.
    if (data.slug !== undefined) {
      const clean = sanitizeSlug(String(data.slug));
      if (!clean) return NextResponse.json({ error: "Slug must contain at least one alphanumeric character" }, { status: 400 });
      data.slug = clean;
    }

    // Snapshot current state into ArticleRevision BEFORE applying update.
    // Skip snapshot if nothing meaningful changed (status-only flips, etc.) — checked below.
    const current = await prisma.article.findUnique({
      where: { id },
      select: { title: true, slug: true, summary: true, body: true, featuredImage: true, categoryId: true, status: true },
    });
    if (current) {
      const willChangeContent =
        (data.title !== undefined && data.title !== current.title) ||
        (data.slug !== undefined && data.slug !== current.slug) ||
        (data.summary !== undefined && data.summary !== current.summary) ||
        (data.body !== undefined && data.body !== current.body) ||
        (data.featuredImage !== undefined && data.featuredImage !== current.featuredImage) ||
        (data.categoryId !== undefined && data.categoryId !== current.categoryId);
      if (willChangeContent) {
        await prisma.articleRevision.create({
          data: {
            articleId: id,
            title: current.title,
            slug: current.slug,
            summary: current.summary,
            body: current.body,
            featuredImage: current.featuredImage,
            categoryId: current.categoryId,
            status: current.status,
            editedById: session.user.id,
            editNote: body.editNote || null,
            bodyLength: current.body?.length || 0,
          },
        });
      }
    }

    // Handle scheduling: future scheduledAt → SCHEDULED. Cron flips to PUBLISHED at the right moment.
    if (body.scheduledAt !== undefined) {
      const scheduledDate = body.scheduledAt ? new Date(body.scheduledAt) : null;
      if (scheduledDate && isNaN(scheduledDate.getTime())) {
        return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
      }
      data.scheduledAt = scheduledDate;
      if (scheduledDate && scheduledDate.getTime() > Date.now()) {
        data.status = "SCHEDULED";
      }
    }

    if (data.status === "SCHEDULED") {
      const effectiveScheduled = data.scheduledAt ?? null;
      if (!effectiveScheduled || new Date(effectiveScheduled).getTime() <= Date.now()) {
        return NextResponse.json({ error: "SCHEDULED status requires a future scheduledAt date" }, { status: 400 });
      }
    }

    if (data.status === "PUBLISHED") data.publishedAt = new Date();

    const article = await prisma.article.update({
      where: { id },
      data,
    });

    // Update tags if tagNames provided (replace-all semantics)
    if (Array.isArray(body.tagNames)) {
      const slugify = (s: string) => s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 80);
      await prisma.articleTag.deleteMany({ where: { articleId: id } });
      const seen = new Set<string>();
      for (const raw of body.tagNames) {
        const name = String(raw || "").trim();
        if (!name) continue;
        const tagSlug = slugify(name);
        if (!tagSlug || seen.has(tagSlug)) continue;
        seen.add(tagSlug);
        const tag = await prisma.tag.upsert({ where: { slug: tagSlug }, update: {}, create: { name, slug: tagSlug } });
        await prisma.articleTag.create({ data: { articleId: id, tagId: tag.id } }).catch(() => {});
      }
    }

    const changes = diffSummary(current as any, data);
    const action = data.status === "PUBLISHED" && current?.status !== "PUBLISHED"
      ? "article.publish"
      : data.status === "SCHEDULED" && current?.status !== "SCHEDULED"
      ? "article.schedule"
      : "article.update";

    await logAudit({
      action,
      resource: "article",
      resourceId: id,
      meta: { changes, title: article.title, status: article.status },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json(article);
  } catch (error) {
    return apiError(error);
  }
}

// DELETE article
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const existing = await prisma.article.findUnique({
      where: { id },
      select: { title: true, slug: true, status: true },
    });
    await prisma.article.delete({ where: { id } });

    await logAudit({
      action: "article.delete",
      resource: "article",
      resourceId: id,
      meta: existing ? { title: existing.title, slug: existing.slug, status: existing.status } : undefined,
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
