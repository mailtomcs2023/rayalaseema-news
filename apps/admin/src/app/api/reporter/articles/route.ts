import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";
import { sanitizeSlug } from "@/lib/slug";

// Articles for the reporter (Expo) app — scoped to ONE reporter.
//
// GET  — only the signed-in reporter's own articles (every status; the app
//        filters by tab).
// POST — create an article authored by the reporter. Token-protected; the
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

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where: { authorId: reporterId },
        include: { category: { select: { name: true, nameEn: true, slug: true, color: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.article.count({ where: { authorId: reporterId } }),
    ]);

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
    if (await prisma.article.findUnique({ where: { slug: cleanSlug }, select: { id: true } })) {
      cleanSlug = `${cleanSlug}-${Date.now()}`;
    }

    // A reporter may only save a draft or submit for review — not publish.
    const finalStatus = status === "SUBMITTED" ? "SUBMITTED" : "DRAFT";

    // KYC gate: only VERIFIED reporters can create ANY article — including
    // drafts. Existing articles can still be edited/submitted via PATCH; this
    // only blocks fresh creation. The reporter app's FAB and empty-state CTAs
    // surface a friendly Alert before getting here, so this 403 is the
    // server-side safety net.
    const jp = await prisma.journalistProfile.findUnique({
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

    const article = await prisma.article.create({
      data: {
        title: String(title).trim(),
        slug: cleanSlug,
        summary: summary ? String(summary).trim() : null,
        body: articleBody || "",
        categoryId,
        featuredImage: featuredImage ? String(featuredImage).trim() : null,
        status: finalStatus,
        language: "TELUGU",
        authorId: reporterId,
      },
    });

    return NextResponse.json(article, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create article" }, { status: 500 });
  }
}
