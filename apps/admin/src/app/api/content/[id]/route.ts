// /api/content/[id] - single content row CRUD (Spec #1, issue #107).
// Mirrors /api/articles/[id] behaviour: PUT snapshots a revision before
// applying changes; DELETE is admin-only hard delete; PIB gate enforced
// on publish.
import { NextRequest, NextResponse } from "next/server";
import {
  prisma,
  ContentType,
  safeValidatePayload,
  contentUpdateSchema,
} from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { rehostDataUrlFields } from "@/lib/rehost-data-url";
import { requireKyc } from "@/lib/kyc-guard";
import { logAudit, diffSummary } from "@/lib/audit";
import { buildSlugFromTitle, isPlaceholderSlug, sanitizeSlug } from "@/lib/slug";
import { resolveDeskId } from "@/lib/desk-resolver";
import { pickLeastLoadedReviewer } from "@/lib/reviewer-assignment";
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

// GET - single content row with relations the editor needs (category,
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
        // Cross-listed categories - editor renders these as the "Also list
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

// PUT - update mutable fields. Snapshots ContentRevision before applying
// changes when content actually changes. Re-validates payload via Zod if
// payload changed. Same PIB gate as articles.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    // Rehost any base64 data: image fields to a hosted URL before validation
    // so a pasted/auto-fetched data URL doesn't trip the 2048-char URL cap.
    const rawBody = await rehostDataUrlFields(await req.json());

    // Zod validation at the boundary. Every field is shape-checked +
    // length-capped before any DB query runs; bad payloads return 400 with
    // structured fieldErrors instead of a Prisma 500. PUT uses the partial
    // schema so omitted fields are left alone.
    const parsed = contentUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    // `body` retained as the alias for downstream code that still reads
    // raw fields (editNote, deskId-undefined check, etc.) without going
    // through the typed allowlist.
    const body = parsed.data as Record<string, any>;
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

    // KYC gate - ANY edit/save by a non-ADMIN with unverified KYC is
    // blocked. ADMINs bypass (see lib/kyc-guard.ts). Previously this only
    // fired on PUBLISH/SCHEDULE transitions, but editors+sub-editors
    // shouldn't be mutating editorial content at all before they're
    // verified. The UI surfaces the 403 + kycRequired flag as a red toast
    // with a "Complete KYC" action.
    {
      const block = await requireKyc(
        { id: session.user.id, role: session.user.role },
        "edit articles",
      );
      if (block) return block;
    }

    // Manual reviewer assignment was removed - auto-assignment on submit
    // (lib/reviewer-assignment.ts) + category pool fallback is the only
    // mechanism now. Ignore any `assignedReviewerId` passed by clients so a
    // stale UI or scripted call can't override the algorithm.

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

    // Backend safety net for the auto-slug feature: if the slug being saved
    // is still one of our placeholders (`untitled-…` / `breaking-…` /
    // `news-…`) AND we have a meaningful title to work with, regenerate the
    // slug from the title via transliteration. The frontend already does
    // this with AI as the user types, but this catches:
    //   - mobile reporter app saves where the AI hook isn't wired
    //   - articles created before the auto-slug feature shipped
    //   - any code path that PUTs raw `untitled-<ts>` without typing a title
    // The generated slug then flows into the sanitization + collision block
    // below exactly as if the user had typed it.
    if (data.slug !== undefined && isPlaceholderSlug(String(data.slug ?? ""))) {
      const fromData = typeof data.title === "string" ? data.title.trim() : "";
      const titleForSlug = fromData
        || (await prisma.content.findUnique({ where: { id }, select: { title: true } }))?.title
        || "";
      if (titleForSlug && !/^untitled\b/i.test(titleForSlug)) {
        data.slug = buildSlugFromTitle(titleForSlug);
      }
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

    // PIB approval gate - same logic as articles. Flagged + not approved → block publish.
    if (data.status === "PUBLISHED") {
      if (current.needsPibApproval && !current.pibApprovedAt) {
        return NextResponse.json({
          error: "PIB approval required",
          detail: "This content was flagged for press-bureau review. An ADMIN must approve it via /api/content/[id]/pib-approve before publish.",
        }, { status: 403 });
      }
      data.publishedAt = new Date();
    }

    // Auto-assign on every DRAFT/REJECTED → SUBMITTED transition so admin-web
    // submissions reach a sub-editor (or the category pool) without a manual
    // step. The reporter app + /api/review already do this; this closes the
    // gap for status changes coming through this route.
    if (data.status === "SUBMITTED" && current.status !== "SUBMITTED" && current.status !== "IN_REVIEW") {
      const effectiveCategoryId = data.categoryId ?? current.categoryId ?? null;
      data.assignedReviewerId = await pickLeastLoadedReviewer(prisma, effectiveCategoryId);
    }

    // Atomic write: content.update + cross-listed categories + tags all
    // succeed together, or none of them do. Without the transaction, a
    // mid-loop tag insert failure leaves the content row updated but with
    // partial tags - silent corruption.
    //
    // Unicode-safe slugify. The old `[^\w\s-]` regex stripped every Telugu
    // character (JS `\w` is ASCII-only), so Telugu tag names always produced
    // an empty slug → silently skipped → ContentTag rows never written.
    // `\p{L}` matches any Unicode letter, `\p{N}` any digit - Telugu now
    // round-trips. Empty result falls through to a timestamp-suffixed slug
    // so we never insert "" into Tag.slug (unique constraint).
    const slugify = (s: string) => {
      const cleaned = s
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]+/gu, "")
        .replace(/\s+/g, "-")
        .slice(0, 80);
      return cleaned || `tag-${Date.now()}`;
    };
    const content = await prisma.$transaction(async (tx) => {
      const updated = await tx.content.update({ where: { id }, data });

      // Additional categories: replace-all when array provided. Editor sends
      // the full desired set; we wipe + re-create. Skipping the array entirely
      // leaves cross-listing untouched.
      if (Array.isArray(body.additionalCategoryIds)) {
        await tx.contentCategory.deleteMany({ where: { contentId: id } });
        const primaryId = (data.categoryId ?? current.categoryId) || null;
        const extras = [...new Set(body.additionalCategoryIds.filter((cid: string) => cid && cid !== primaryId))];
        if (extras.length > 0) {
          await tx.contentCategory.createMany({
            data: extras.map((cid) => ({ contentId: id, categoryId: cid as string })),
            skipDuplicates: true,
          });
        }
      }

      // Tags: replace-all semantics when tagNames provided.
      if (Array.isArray(body.tagNames)) {
        await tx.contentTag.deleteMany({ where: { contentId: id } });
        const seenNames = new Set<string>();
        for (const raw of body.tagNames) {
          const name = String(raw || "").trim();
          if (!name) continue;
          const dedupKey = name.toLowerCase();
          if (seenNames.has(dedupKey)) continue;
          seenNames.add(dedupKey);

          // Look up by exact name first - the curated seed already created
          // Tag rows like { name: "ఎన్నికలు", slug: "elections" }, and we
          // want to reuse those instead of creating a duplicate Tag with a
          // less-readable slug. Falling back to slug-then-create only when
          // the name doesn't exist yet keeps Tag.slug → human-readable.
          let tag = await tx.tag.findUnique({ where: { name } });
          if (!tag) {
            const tagSlug = slugify(name);
            // Race-safe upsert by slug - a parallel save with the same new
            // tag name would otherwise hit the unique constraint.
            tag = await tx.tag.upsert({
              where: { slug: tagSlug },
              update: {},
              create: { name, slug: tagSlug },
            });
          }
          await tx.contentTag.create({ data: { contentId: id, tagId: tag.id } });
        }
      }

      return updated;
    });

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

    // Spec #4 D5 (#218) - fire-and-forget IndexNow ping on publish so Bing /
    // Yandex / Naver pick up the new URL in minutes. Hub URLs also re-ping
    // so their article-list freshens. Failure is non-fatal.
    if (action === "content.publish" && content.type === "ARTICLE" && content.slug) {
      void pingArticlePublish(content.id, content.slug);
    }

    // Spec #4 G2 (#232) - run location NER on publish + write ContentLocation
    // rows. Replace-all semantics so re-publishes converge to the freshest
    // gazetteer pass. Failure is non-fatal - publish still succeeds; the
    // editor can manually re-tag from the admin UI if NER missed something.
    if (action === "content.publish" && content.type === "ARTICLE") {
      try {
        await tagContentLocations(content.id, content.title, content.body || "");
        // G3 (#233) - inject up to 2 internal links to the primary district +
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

// DELETE - tiered soft-delete.
//   REPORTER: may soft-delete own rows whose status is DRAFT or SUBMITTED.
//   EDITOR / SUB_EDITOR: same window - DRAFT or SUBMITTED
//     only. Once a sub-editor claims the row (IN_REVIEW) the article is "in
//     the editorial pipeline" and deleting it would orphan payments / audit
//     state; only ADMIN can override after that point.
//   ADMIN: may soft-delete anything, and with `?purge=1` hard-deletes the
//     row (cascade kills tags/revisions/payments per schema).
// Soft-deleted rows stay in DB so admin can restore via POST /restore.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    // KYC gate - same rule as create/edit. Unverified non-ADMINs can't
    // delete editorial content either; the row-level role checks below
    // still apply on top.
    {
      const block = await requireKyc(
        { id: session.user.id, role: session.user.role },
        "delete articles",
      );
      if (block) return block;
    }

    const { id } = await params;
    const url = new URL(req.url);
    const purge = url.searchParams.get("purge") === "1";

    const existing = await prisma.content.findUnique({
      where: { id },
      select: { type: true, title: true, slug: true, status: true, authorId: true, deletedAt: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const role = session.user.role;
    if (role !== "ADMIN") {
      // Non-admins (REPORTER / SUB_EDITOR / EDITOR) can delete only their OWN
      // articles, and only before review starts (DRAFT / SUBMITTED). Once an
      // article is IN_REVIEW or further along, payments + review/audit history
      // are tied to it, so only an ADMIN can remove it - and only an ADMIN can
      // ever delete someone else's article.
      if (existing.authorId !== session.user.id) {
        return NextResponse.json({ error: "You can only delete your own articles." }, { status: 403 });
      }
      if (existing.status !== "DRAFT" && existing.status !== "SUBMITTED") {
        return NextResponse.json(
          { error: `Article is ${existing.status} - only an admin can delete it from this point.` },
          { status: 403 },
        );
      }
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
