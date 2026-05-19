import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/articles/[id]/revisions — list revisions, latest first
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const revisions = await prisma.articleRevision.findMany({
      where: { articleId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        bodyLength: true,
        editNote: true,
        createdAt: true,
        editedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json({ revisions });
  } catch (error) {
    return apiError(error);
  }
}
