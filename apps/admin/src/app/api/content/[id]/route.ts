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
import { pingIndexNow } from "@/lib/indexnow";
import { tagContentLocations } from "@/lib/location-ner-hook";
import { injectInternalLinks } from "@/lib/internal-linker";

// Build the canonical article URL the same way articleHref() does in apps/web.
// Kept inline here so admin doesn't take a cross-app import; logic is small
// + stable enough that drift is unlikely.
function buildArticleUrl(siteUrl: string, id: string, slug: string, districtSlug: string | null, constituencySlug: string | null): string {
  const suffix = id.slice(-8).toLowerCase();
  if (districtSlug && constituencySlug) {
    return `${siteUrl}/${districtSlug}/${constituencySlug}/${slug}-${suffix}`;
  }
  return `${siteUrl}/news/${slug}-${suffix}`;
}

async function pingArticlePublish(contentId: string, slug: string) {
  try {
    const row = await prisma.content.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        constituency: { select: { slug: true, district: { select: { slug: true } } } },
      },
    });
    const siteUrl = process.env.SITE_URL || "https://rayalaseemanews.com";
    const districtSlug = row?.constituency?.district.slug ?? null;
    const constituencySlug = row?.constituency?.slug ?? null;
    const urls = [
      buildArticleUrl(siteUrl, contentId, slug, districtSlug, constituencySlug),
      siteUrl,
      `${siteUrl}/news-sitemap.xml`,
    ];
    if (districtSlug) urls.push(`${siteUrl}/district/${districtSlug}`);
    if (constituencySlug) urls.push(`${siteUrl}/constituency/${constituencySlug}`);
    await pingIndexNow(urls);
  } catch (err) {
    console.warn("[content publish] IndexNow ping failed (non-fatal):", (err as Error).message);
  }
}

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
        // Cross-listed categories — editor renders these as the "Also list
        // under" multi-select selection.
        additionalCategories: { select: { categoryId: true } },
      },
    });
    if (!content) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // REPORTERs can only read their own rows. Return 404 (not 403) so they
    // can't probe for existence of admin drafts by id.
    if (session.user.role === "REPORTER" && content.authorId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Flatten additionalCategories to a simple string[] for the editor.
    const { additionalCategories, ...rest } = content;
    return NextResponse.json({
      ...rest,
      additionalCategoryIds: additionalCategories.map((x) => x.categoryId),
    });
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

    // Admin override for auto-assignment (Stage 2). EDITOR + ADMIN can move
    // an article to a different sub-editor (or unassign with null). REPORTER
    // + SUB_EDITOR can't touch this field even when passed in the body.
    if (body.assignedReviewerId !== undefined) {
      const role = (session.user as any).role;
      if (role === "ADMIN" || role === "EDITOR") {
        data.assignedReviewerId = body.assignedReviewerId === "" ? null : body.assignedReviewerId;
      }
    }

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
        needsPibApproval: true, pibApprovedAt: true, authorId: true,
      },
    });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // REPORTERs may only edit their own rows.
    if (session.user.role === "REPORTER" && current.authorId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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

    // Additional categories: replace-all when array provided. Editor sends
    // the full desired set; we wipe + re-create. Skipping the array entirely
    // leaves cross-listing untouched.
    if (Array.isArray(body.additionalCategoryIds)) {
      await prisma.contentCategory.deleteMany({ where: { contentId: id } });
      const primaryId = (data.categoryId ?? current.categoryId) || null;
      const extras = [...new Set(body.additionalCategoryIds.filter((cid: string) => cid && cid !== primaryId))];
      for (const cid of extras) {
        await prisma.contentCategory.create({ data: { contentId: id, categoryId: cid as string } }).catch(() => {});
      }
    }

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

    // Spec #4 D5 (#218) — fire-and-forget IndexNow ping on publish so Bing /
    // Yandex / Naver pick up the new URL in minutes. Hub URLs also re-ping
    // so their article-list freshens. Failure is non-fatal.
    if (action === "content.publish" && content.type === "ARTICLE" && content.slug) {
      void pingArticlePublish(content.id, content.slug);
    }

    // Spec #4 G2 (#232) — run location NER on publish + write ContentLocation
    // rows. Replace-all semantics so re-publishes converge to the freshest
    // gazetteer pass. Failure is non-fatal — publish still succeeds; the
    // editor can manually re-tag from the admin UI if NER missed something.
    if (action === "content.publish" && content.type === "ARTICLE") {
      try {
        await tagContentLocations(content.id, content.title, content.body || "");
        // G3 (#233) — inject up to 2 internal links to the primary district +
        // constituency hubs. Reads the just-written ContentLocation rows.
        // Idempotent: no-op if the body already links to the same hubs.
        const newBody = await injectInternalLinks(content.id, content.body || "");
        if (newBody !== content.body) {
          await prisma.content.update({ where: { id: content.id }, data: { body: newBody } });
        }
      } catch (err) {
        console.warn("[content publish] location NER / internal-link failed (non-fatal):", (err as Error).message);
      }
    }

    return NextResponse.json(content);
  } catch (error) {
    return apiError(error);
  }
}

// DELETE — tiered soft-delete.
//   REPORTER: may soft-delete own rows whose status is DRAFT or SUBMITTED.
//   EDITOR / CHIEF_SUB_EDITOR / SUB_EDITOR: may soft-delete any row whose
//     status is not PUBLISHED.
//   ADMIN: may soft-delete anything, and with `?purge=1` hard-deletes the
//     row (cascade kills tags/revisions/payments per schema).
// Soft-deleted rows stay in DB so admin can restore via POST /restore.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const purge = url.searchParams.get("purge") === "1";

    const existing = await prisma.content.findUnique({
      where: { id },
      select: { type: true, title: true, slug: true, status: true, authorId: true, deletedAt: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = session.user.role;
    if (role === "REPORTER") {
      if (existing.authorId !== session.user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (existing.status !== "DRAFT" && existing.status !== "SUBMITTED") {
        return NextResponse.json({ error: "Reporters can only delete drafts or submissions" }, { status: 403 });
      }
    } else if (role === "EDITOR" || role === "CHIEF_SUB_EDITOR" || role === "SUB_EDITOR") {
      if (existing.status === "PUBLISHED") {
        return NextResponse.json({ error: "Unpublish before deleting a live article" }, { status: 403 });
      }
    } else if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (purge) {
      if (role !== "ADMIN") return NextResponse.json({ error: "Only ADMIN may purge" }, { status: 403 });
      await prisma.content.delete({ where: { id } });
      await logAudit({
        action: "content.purge",
        resource: "content",
        resourceId: id,
        meta: { type: existing.type, title: existing.title, slug: existing.slug, status: existing.status },
        actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
        req,
      });
      return NextResponse.json({ success: true, purged: true });
    }

    if (existing.deletedAt) return NextResponse.json({ success: true, alreadyDeleted: true });

    await prisma.content.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: session.user.id },
    });

    await logAudit({
      action: "content.delete",
      resource: "content",
      resourceId: id,
      meta: { type: existing.type, title: existing.title, slug: existing.slug, status: existing.status, soft: true },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
