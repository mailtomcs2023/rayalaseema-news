// /api/content - unified content CRUD (Spec #1, issue #107).
// Replaces /api/articles + /api/videos + /api/reels + /api/stories +
// /api/galleries + /api/cartoons + /api/breaking-news once those are
// retired in Phase H (#131, #133).
//
// Validation: per-type payload Zod schemas live in @rayalaseema/db
// (packages/db/src/payload-schemas.ts). Bad payload → 400 with the
// field-level ZodError flattened.
import { NextRequest, NextResponse } from "next/server";
import {
  prisma,
  ContentType,
  safeValidatePayload,
  contentCreateSchema,
} from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { rehostDataUrlFields } from "@/lib/rehost-data-url";
import { requireKyc } from "@/lib/kyc-guard";
import { logAudit } from "@/lib/audit";
import { sanitizeSlug } from "@/lib/slug";
import { resolveDeskId } from "@/lib/desk-resolver";

const VALID_TYPES = Object.values(ContentType) as string[];

// GET /api/content - list with filters (type, status, category, search) + pagination
// GET /api/content - list with filters + pagination.
//
// Two pagination modes:
//
//   1. CURSOR (preferred, constant-time) - pass `?cursor=<id>&limit=15`.
//      Returns `nextCursor` (or null when done) and `hasMore`. Forward-only.
//      No `total` unless `?includeTotal=1` is also passed, because the count()
//      is what makes large pages slow in the first place.
//
//   2. OFFSET (legacy fallback) - pass `?page=2&limit=15` like before.
//      Returns `total` + `page` + `limit`. Cost grows with page number.
//      Use only for "jump to page N" UX - and even then, expensive past
//      page 50 on a multi-thousand-row table.
//
// The /content table page still uses offset today; switching it to cursor is
// a separate frontend PR (TanStack Query) so this route ships
// backward-compatibly.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor") || "";
    const page = parseInt(searchParams.get("page") || "1");
    // Default 10 matches the admin's standard per-page size across every
    // paginated table - callers can still override via ?limit=N up to 200.
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10"), 1), 200);
    const includeTotal = searchParams.get("includeTotal") === "1" || !cursor;
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const status = searchParams.get("status") || "";
    const category = searchParams.get("category") || "";

    // `?ids=a,b,c` short-circuits - returns just those rows (lookup helper).
    const idsParam = searchParams.get("ids");
    if (idsParam) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 500);
      const items = await prisma.content.findMany({
        where: { id: { in: ids } },
        select: { id: true, type: true, title: true, slug: true, summary: true, featuredImage: true },
      });
      return NextResponse.json({ items, total: items.length, hasMore: false, nextCursor: null });
    }

    // Safety-net cleanup: soft-delete never-touched placeholder drafts
    // ("New Content" picks abandoned >1h ago) so they don't accumulate.
    // Fire-and-forget + gated to the default first-page list so it doesn't
    // run on every keystroke / pagination request.
    if (page === 1 && !cursor && !search) {
      prisma.content.updateMany({
        where: {
          status: "DRAFT",
          title: { startsWith: "Untitled " },
          featuredImage: null,
          deletedAt: null,
          createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
          OR: [{ body: null }, { body: "" }],
        },
        data: { deletedAt: new Date() },
      }).catch(() => {});
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

    // Visibility:
    //   REPORTER   - only their own rows.
    //   SUB_EDITOR - rows in their assigned categories OR rows they authored.
    //                Mirrors /api/review's strict-assignment scope so a SE
    //                doesn't see sports articles when they only cover crime.
    //   EDITOR / ADMIN - everything (editor is the cross-
    //                category super-reviewer in this newsroom).
    if (session.user.role === "REPORTER") {
      where.authorId = session.user.id;
    } else if (session.user.role === "SUB_EDITOR") {
      const assignments = await prisma.userCategory.findMany({
        where: { userId: session.user.id },
        select: { categoryId: true },
      });
      const categoryIds = assignments.map((a) => a.categoryId);
      // OR clause merges with any existing search OR - wrap in AND so search
      // (title-contains) and scope (own-or-in-my-categories) both apply.
      const scopeOr = [
        { authorId: session.user.id },
        ...(categoryIds.length > 0 ? [{ categoryId: { in: categoryIds } }] : []),
      ];
      if (where.OR) {
        const existingOr = where.OR;
        delete where.OR;
        where.AND = [{ OR: existingOr }, { OR: scopeOr }];
      } else {
        where.OR = scopeOr;
      }
    }

    // Soft-delete: hide trashed rows by default. `?trash=1` (admin/editor)
    // returns ONLY trashed rows. Reporters never see trash; the soft-deleted
    // row simply disappears from their list.
    const trash = searchParams.get("trash") === "1";
    if (trash) {
      const role = session.user.role;
      if (role !== "ADMIN" && role !== "EDITOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }

    // Stable ordering for cursor pagination - createdAt alone isn't unique
    // enough (two rows can share a timestamp), so we add `id` as the secondary
    // key. Both columns indexed together is the right shape for the composite
    // index we'll add in PR 14.
    const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];

    // Cursor mode - fetch one extra row to detect `hasMore` cheaply, then
    // slice it off before returning. `skip: 1` tells Prisma the cursor row
    // is the EXCLUSIVE boundary (the last item of the previous page),
    // not part of this page.
    if (cursor) {
      const findArgs: any = {
        where,
        include: {
          category: { select: { name: true, nameEn: true, slug: true, color: true } },
          author: { select: { name: true } },
        },
        orderBy,
        take: limit + 1,
        cursor: { id: cursor },
        skip: 1,
      };
      const [rows, total] = await Promise.all([
        prisma.content.findMany(findArgs),
        includeTotal ? prisma.content.count({ where }) : Promise.resolve(null),
      ]);
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;
      return NextResponse.json({ items, hasMore, nextCursor, total, limit });
    }

    // Offset mode (legacy). Kept so the existing /content UI works unchanged
    // until it migrates to cursor in the TanStack Query PR.
    const offset = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      prisma.content.findMany({
        where,
        include: {
          category: { select: { name: true, nameEn: true, slug: true, color: true } },
          author: { select: { name: true } },
        },
        orderBy,
        take: limit + 1,
        skip: offset,
      }),
      prisma.content.count({ where }),
    ]);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;
    return NextResponse.json({ items, total, page, limit, hasMore, nextCursor });
  } catch (error) {
    return apiError(error);
  }
}

// POST /api/content - create new content row.
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
    // Rehost any base64 data: image fields to a hosted URL before validation
    // so a pasted/auto-fetched data URL doesn't trip the 2048-char URL cap.
    const rawBody = await rehostDataUrlFields(await req.json());

    // Zod validation at the boundary - every field is shape-checked +
    // length-capped before we run any DB queries. Failures surface as
    // structured `fieldErrors` so clients can render per-field messages.
    const parsed = contentCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
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
      additionalCategoryIds,
    } = parsed.data;

    // KYC gate. ADMINs bypass; every other role must be VERIFIED to
    // create editorial content at any status. Was previously per-status
    // (PUBLISHED/SCHEDULED only, with REPORTER blocked entirely) but
    // editors+sub-editors should be in the same boat - no drafting, no
    // scheduling, no publishing before identity is confirmed.
    {
      const block = await requireKyc(
        { id: session.user.id, role: session.user.role },
        status === "PUBLISHED"
          ? "publish"
          : status === "SCHEDULED"
            ? "schedule"
            : "create articles",
      );
      if (block) return block;
    }

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

    // Atomic write: Content row + cross-listed categories + tags all land
    // together or none of them do. Without the transaction, an N+1 .catch()
    // loop could leave a half-tagged article on disk if the DB blipped
    // mid-loop (silent corruption - the worst kind).
    const slugify = (s: string) => s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").substring(0, 80);
    const content = await prisma.$transaction(async (tx) => {
      const created = await tx.content.create({
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

      // Multi-category cross-listing. Dedupe + skip the primary (redundant
      // join + would violate the composite PK).
      if (Array.isArray(additionalCategoryIds) && additionalCategoryIds.length > 0) {
        const extras = [...new Set(additionalCategoryIds.filter((id) => id && id !== created.categoryId))];
        if (extras.length > 0) {
          await tx.contentCategory.createMany({
            data: extras.map((cid) => ({ contentId: created.id, categoryId: cid })),
            skipDuplicates: true,
          });
        }
      }

      // Tags (auto-create missing). Same slugify rules as the legacy article API.
      if (Array.isArray(tagNames) && tagNames.length > 0) {
        const seen = new Set<string>();
        for (const raw of tagNames) {
          const name = String(raw || "").trim();
          if (!name) continue;
          const tagSlug = slugify(name);
          if (!tagSlug || seen.has(tagSlug)) continue;
          seen.add(tagSlug);
          const tag = await tx.tag.upsert({
            where: { slug: tagSlug },
            update: {},
            create: { name, slug: tagSlug },
          });
          await tx.contentTag.create({ data: { contentId: created.id, tagId: tag.id } });
        }
      }

      return created;
    });

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
