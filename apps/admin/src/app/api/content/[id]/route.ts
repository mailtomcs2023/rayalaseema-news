// /api/content/[id] — single content row CRUD (Spec #1, issue #107).
// Mirrors /api/articles/[id] behaviour: PUT snapshots a revision before
// applying changes; DELETE is admin-only hard delete; PIB gate enforced
// on publish.
import { NextRequest, NextResponse } from "next/server";
import { prisma, ContentType, safeValidatePayload } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit, diffSummary } from "@/lib/audit";
import { sanitizeSlug } from "@/lib/slug";
import { resolveDeskId } from "@/lib/desk-resolver";

// GET — single content row with relations the editor needs (category,
// author, tags). Returns 404 if not found.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const content = await prisma.content.findUnique({
      where: { id },
      include: {
        category: true,
        author: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
    });
    if (!content) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(content);
  } catch (error) {
    return apiError(error);
  }
}

// PUT — update mutable fields. Snapshots ContentRevision before applying
// changes when content actually changes. Re-validates payload via Zod if
// payload changed. Same PIB gate as articles.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    const UPDATABLE = [
      "title", "slug", "summary", "body", "categoryId", "featuredImage",
      "payload", "status", "featured", "constituencyId", "deskId",
      "sourceUrl", "needsPibApproval",
    ] as const;
    for (const key of UPDATABLE) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (data.constituencyId === "") data.constituencyId = null;

    // Re-resolve desk if category/constituency touched or if editor passed deskId.
    const needsDeskResolve =
      body.deskId !== undefined ||
      body.categoryId !== undefined ||
      body.constituencyId !== undefined;
    if (needsDeskResolve) {
      const cur = await prisma.content.findUnique({
        where: { id },
        select: { categoryId: true, constituencyId: true, deskId: true },
      });
      const effectiveCategoryId = data.categoryId ?? cur?.categoryId ?? null;
      const effectiveConstituencyId = data.constituencyId ?? cur?.constituencyId ?? null;
      const effectiveDeskId = body.deskId === undefined ? cur?.deskId ?? null : body.deskId;
      data.deskId = await resolveDeskId({
        deskId: effectiveDeskId,
        categoryId: effectiveCategoryId,
        constituencyId: effectiveConstituencyId,
      });
    }

    // Sanitize slug if present in update payload.
    if (data.slug !== undefined && data.slug !== null) {
      const clean = sanitizeSlug(String(data.slug));
      if (!clean) return NextResponse.json({ error: "Slug must contain at least one alphanumeric character" }, { status: 400 });
      // Block slug collision with a different row.
      const other = await prisma.content.findUnique({ where: { slug: clean }, select: { id: true } });
      if (other && other.id !== id) return NextResponse.json({ error: "Slug already exists" }, { status: 400 });
      data.slug = clean;
    }

    // Snapshot current state into ContentRevision BEFORE applying update (only
    // when something content-shaped actually changed).
    const current = await prisma.content.findUnique({
      where: { id },
      select: {
        type: true, title: true, slug: true, summary: true, body: true,
        featuredImage: true, categoryId: true, status: true, payload: true,
        needsPibApproval: true, pibApprovedAt: true,
      },
    });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Re-validate payload if changed.
    if (data.payload !== undefined && data.payload !== null) {
      const validation = safeValidatePayload(current.type as ContentType, data.payload);
      if (!validation.success) {
        return NextResponse.json({
          error: "Invalid payload shape",
          fieldErrors: validation.error.flatten().fieldErrors,
        }, { status: 400 });
      }
    }

    const willChangeContent =
      (data.title !== undefined && data.title !== current.title) ||
      (data.slug !== undefined && data.slug !== current.slug) ||
      (data.summary !== undefined && data.summary !== current.summary) ||
      (data.body !== undefined && data.body !== current.body) ||
      (data.featuredImage !== undefined && data.featuredImage !== current.featuredImage) ||
      (data.categoryId !== undefined && data.categoryId !== current.categoryId) ||
      (data.payload !== undefined && JSON.stringify(data.payload) !== JSON.stringify(current.payload));

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

    // Scheduling: future scheduledAt → SCHEDULED; cron flips it later.
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

    // PIB approval gate — same logic as articles. Flagged + not approved → block publish.
    if (data.status === "PUBLISHED") {
      if (current.needsPibApproval && !current.pibApprovedAt) {
        return NextResponse.json({
          error: "PIB approval required",
          detail: "This content was flagged for press-bureau review. An ADMIN must approve it via /api/content/[id]/pib-approve before publish.",
        }, { status: 403 });
      }
      data.publishedAt = new Date();
    }

    const content = await prisma.content.update({ where: { id }, data });

    // Tags: replace-all semantics when tagNames provided.
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
      data.status === "PUBLISHED" && current.status !== "PUBLISHED"
        ? "content.publish"
        : data.status === "SCHEDULED" && current.status !== "SCHEDULED"
        ? "content.schedule"
        : "content.update";

    await logAudit({
      action,
      resource: "content",
      resourceId: id,
      meta: { type: content.type, changes, title: content.title, status: content.status },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json(content);
  } catch (error) {
    return apiError(error);
  }
}

// DELETE — hard delete (ADMIN only). Cascade kills ContentTag + ContentRevision
// + ContentPayment per schema. Audit log captures the slug/title for forensic
// trace even after the row is gone.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const existing = await prisma.content.findUnique({
      where: { id },
      select: { type: true, title: true, slug: true, status: true },
    });
    await prisma.content.delete({ where: { id } });

    await logAudit({
      action: "content.delete",
      resource: "content",
      resourceId: id,
      meta: existing ? { type: existing.type, title: existing.title, slug: existing.slug, status: existing.status } : undefined,
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
