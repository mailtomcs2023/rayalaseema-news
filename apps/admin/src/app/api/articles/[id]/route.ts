// /api/articles/[id] — Spec #1 #133 compat shim over Content where type=ARTICLE.
// Legacy callers (ePaper editor, reporter app) keep working.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit, diffSummary } from "@/lib/audit";
import { sanitizeSlug } from "@/lib/slug";
import { resolveDeskId } from "@/lib/desk-resolver";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const article = await prisma.content.findUnique({
      where: { id },
      include: { category: true, author: true, tags: { include: { tag: true } } },
    });
    if (!article || article.type !== "ARTICLE") return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(article);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    // metaTitle/metaDescription/ogImage/breaking dropped (not on Content schema)
    for (const key of ["title", "slug", "summary", "body", "categoryId", "featuredImage", "status", "featured", "constituencyId", "deskId"] as const) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (!data.constituencyId) data.constituencyId = null;

    const needsDeskResolve =
      body.deskId !== undefined || body.categoryId !== undefined || body.constituencyId !== undefined;
    if (needsDeskResolve) {
      const cur = await prisma.content.findUnique({
        where: { id },
        select: { categoryId: true, constituencyId: true, deskId: true },
      });
      const effectiveCategoryId = data.categoryId ?? cur?.categoryId ?? null;
      const effectiveConstituencyId = data.constituencyId ?? cur?.constituencyId ?? null;
      const effectiveDeskId = body.deskId === undefined ? cur?.deskId ?? null : body.deskId;
      data.deskId = await resolveDeskId({ deskId: effectiveDeskId, categoryId: effectiveCategoryId, constituencyId: effectiveConstituencyId });
    }

    if (data.slug !== undefined) {
      const clean = sanitizeSlug(String(data.slug));
      if (!clean) return NextResponse.json({ error: "Slug must contain at least one alphanumeric character" }, { status: 400 });
      data.slug = clean;
    }

    const current = await prisma.content.findUnique({
      where: { id },
      select: { title: true, slug: true, summary: true, body: true, featuredImage: true, categoryId: true, status: true, needsPibApproval: true, pibApprovedAt: true, payload: true },
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
        await prisma.contentRevision.create({
          data: {
            contentId: id,
            title: current.title,
            slug: current.slug,
            summary: current.summary,
            body: current.body,
            featuredImage: current.featuredImage,
            categoryId: current.categoryId,
            payload: current.payload ?? undefined,
            status: current.status,
            editedById: session.user.id,
            editNote: body.editNote || null,
            bodyLength: current.body?.length || 0,
          },
        });
      }
    }

    if (body.scheduledAt !== undefined) {
      const scheduledDate = body.scheduledAt ? new Date(body.scheduledAt) : null;
      if (scheduledDate && isNaN(scheduledDate.getTime())) {
        return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
      }
      data.scheduledAt = scheduledDate;
      if (scheduledDate && scheduledDate.getTime() > Date.now()) data.status = "SCHEDULED";
    }
    if (data.status === "SCHEDULED") {
      const effectiveScheduled = data.scheduledAt ?? null;
      if (!effectiveScheduled || new Date(effectiveScheduled).getTime() <= Date.now()) {
        return NextResponse.json({ error: "SCHEDULED status requires a future scheduledAt date" }, { status: 400 });
      }
    }

    if (data.status === "PUBLISHED") {
      if (current?.needsPibApproval && !current?.pibApprovedAt) {
        return NextResponse.json({
          error: "PIB approval required",
          detail: "This content was flagged for press-bureau review. An ADMIN must approve it via /api/articles/[id]/pib-approve before publish.",
        }, { status: 403 });
      }
      data.publishedAt = new Date();
    }

    const article = await prisma.content.update({ where: { id }, data });

    if (Array.isArray(body.tagNames)) {
      const slugify = (s: string) => s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 80);
      await prisma.contentTag.deleteMany({ where: { contentId: id } });
      const seen = new Set<string>();
      for (const raw of body.tagNames) {
        const name = String(raw || "").trim();
        if (!name) continue;
        const tagSlug = slugify(name);
        if (!tagSlug || seen.has(tagSlug)) continue;
        seen.add(tagSlug);
        const tag = await prisma.tag.upsert({ where: { slug: tagSlug }, update: {}, create: { name, slug: tagSlug } });
        await prisma.contentTag.create({ data: { contentId: id, tagId: tag.id } }).catch(() => {});
      }
    }

    const changes = diffSummary(current as any, data);
    const action =
      data.status === "PUBLISHED" && current?.status !== "PUBLISHED" ? "content.publish"
      : data.status === "SCHEDULED" && current?.status !== "SCHEDULED" ? "content.schedule"
      : "content.update";

    await logAudit({
      action,
      resource: "content",
      resourceId: id,
      meta: { changes, title: article.title, status: article.status, via: "compat:/api/articles" },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json(article);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const existing = await prisma.content.findUnique({
      where: { id },
      select: { title: true, slug: true, status: true, type: true },
    });
    await prisma.content.delete({ where: { id } });

    await logAudit({
      action: "content.delete",
      resource: "content",
      resourceId: id,
      meta: existing ? { type: existing.type, title: existing.title, slug: existing.slug, status: existing.status, via: "compat:/api/articles" } : undefined,
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
