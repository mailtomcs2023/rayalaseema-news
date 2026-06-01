import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";
import { sanitizeSlug } from "@/lib/slug";
import { resolveDeskId } from "@/lib/desk-resolver";
import { pickLeastLoadedReviewer } from "@/lib/reviewer-assignment";

// Articles for the reporter (Expo) app - scoped to ONE reporter.
//
// GET  - only the signed-in reporter's own articles (every status; the app
//        filters by tab).
// POST - create an article authored by the reporter. Token-protected; the
//        author is the token's user, and the reporter can only save a draft
//        or submit for review (never publish directly).
export async function GET(req: NextRequest) {
  try {
    const reporterId = await getReporterId(req);
    if (!reporterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50") || 50, 100);

    const [rows, total] = await Promise.all([
      prisma.content.findMany({
        where: { type: "ARTICLE", authorId: reporterId },
        // Explicit select - keeps the payload small and avoids any optional
        // columns (e.g. PIB workflow) that may not be present in every env.
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          status: true,
          featuredImage: true,
          rejectionNote: true,
          viewCount: true,
          createdAt: true,
          updatedAt: true,
          categoryId: true,
          category: { select: { name: true, nameEn: true, slug: true, color: true } },
          // Inline payment so the reporter's list shows ₹amount + status next
          // to each article. 1-1 in practice via contentId @unique.
          payments: {
            select: { totalAmount: true, status: true, currency: true, paidAt: true, paymentMethod: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.content.count({ where: { type: "ARTICLE", authorId: reporterId } }),
    ]);

    // Flatten `payments[0]` to `payment` so callers don't deal with the
    // 1-to-many array shape that Prisma returns for a 1-1 relation.
    const articles = rows.map(({ payments, ...rest }) => ({
      ...rest,
      payment: payments[0] ?? null,
    }));

    return NextResponse.json({ articles, total });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load articles" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const reporterId = await getReporterId(req);
  if (!reporterId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { title, slug, summary, body: articleBody, categoryId, featuredImage, status } = body;

    if (!title || !String(title).trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!categoryId) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    // Sanitize the slug; if it's taken, suffix a timestamp so a reporter never
    // hits a "slug already exists" error from the app.
    let cleanSlug = sanitizeSlug(slug || title) || `news-${Date.now()}`;
    if (await prisma.content.findUnique({ where: { slug: cleanSlug }, select: { id: true } })) {
      cleanSlug = `${cleanSlug}-${Date.now()}`;
    }

    // A reporter may only save a draft or submit for review - not publish.
    const finalStatus = status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";

    // KYC gate: only VERIFIED reporters can create ANY article - including
    // drafts. Existing articles can still be edited/submitted via PATCH; this
    // only blocks fresh creation. The reporter app's FAB and empty-state CTAs
    // surface a friendly Alert before getting here, so this 403 is the
    // server-side safety net.
    const jp = await prisma.reporterProfile.findUnique({
      where: { userId: reporterId },
      select: { kycStatus: true },
    });
    if (!jp || jp.kycStatus !== "VERIFIED") {
      return NextResponse.json(
        {
          error: "KYC not verified. You can create articles once admin verifies your documents.",
          code: "KYC_NOT_VERIFIED",
          kycStatus: jp?.kycStatus || "PENDING",
        },
        { status: 403 },
      );
    }

    // Auto-pick desk so reporter app doesn't need a desk picker UI.
    const resolvedDeskId = await resolveDeskId({
      categoryId,
      constituencyId: null,
    });

    // Auto-assign a sub-editor at submit time so the article lands directly
    // in the right reviewer's queue. For drafts (status=DRAFT) we skip
    // assignment - no point reserving a reviewer for an article that may
    // never be submitted.
    const assignedReviewerId =
      finalStatus === "SUBMITTED"
        ? await pickLeastLoadedReviewer(prisma, categoryId)
        : null;

    const article = await prisma.content.create({
      data: {
        type: "ARTICLE",
        title: String(title).trim(),
        slug: cleanSlug,
        summary: summary ? String(summary).trim() : null,
        body: articleBody || "",
        categoryId,
        featuredImage: featuredImage ? String(featuredImage).trim() : null,
        status: finalStatus,
        deskId: resolvedDeskId,
        language: "TELUGU",
        authorId: reporterId,
        assignedReviewerId,
      },
      // Narrow the RETURNING clause so callers (Expo + reporter web) never see
      // optional columns that aren't migrated in every environment.
      select: { id: true, title: true, slug: true, status: true, createdAt: true },
    });

    return NextResponse.json(article, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create article" }, { status: 500 });
  }
}
