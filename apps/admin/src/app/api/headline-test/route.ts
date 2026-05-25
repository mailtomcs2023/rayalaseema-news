import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/headline-test — list recent tests with status + variant click counts.
// POST /api/headline-test — body { articleId, variantA, variantB } — create test.
// Push send + click tracking + promote-winner live on separate routes.

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const tests = await prisma.headlineTest.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ tests });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    // Spec #1 A1B (#188) — column renamed articleId -> contentId. Accept the
    // old `articleId` key as an alias so any in-flight client code still works.
    const contentId: string | undefined = body.contentId || body.articleId;
    const { variantA, variantB } = body as { variantA?: string; variantB?: string };
    if (!contentId || !variantA?.trim() || !variantB?.trim()) {
      return NextResponse.json({ error: "contentId + variantA + variantB required" }, { status: 400 });
    }
    if (variantA.trim() === variantB.trim()) {
      return NextResponse.json({ error: "Variants must differ" }, { status: 400 });
    }
    const content = await prisma.content.findUnique({ where: { id: contentId }, select: { id: true, type: true } });
    if (!content || content.type !== "ARTICLE") return NextResponse.json({ error: "Article not found" }, { status: 404 });

    const test = await prisma.headlineTest.create({
      data: {
        contentId,
        variantA: variantA.trim(),
        variantB: variantB.trim(),
        createdById: session.user.id,
      },
    });
    return NextResponse.json({ test });
  } catch (e) { return apiError(e); }
}
