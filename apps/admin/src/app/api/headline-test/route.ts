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
      include: { /* keep slim — admin list view */ },
    });
    return NextResponse.json({ tests });
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const { articleId, variantA, variantB } = body as { articleId?: string; variantA?: string; variantB?: string };
    if (!articleId || !variantA?.trim() || !variantB?.trim()) {
      return NextResponse.json({ error: "articleId + variantA + variantB required" }, { status: 400 });
    }
    if (variantA.trim() === variantB.trim()) {
      return NextResponse.json({ error: "Variants must differ" }, { status: 400 });
    }
    const article = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true } });
    if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });

    const test = await prisma.headlineTest.create({
      data: {
        articleId,
        variantA: variantA.trim(),
        variantB: variantB.trim(),
        createdById: session.user.id,
      },
    });
    return NextResponse.json({ test });
  } catch (e) { return apiError(e); }
}
