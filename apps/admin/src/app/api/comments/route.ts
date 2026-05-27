import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const status = req.nextUrl.searchParams.get("status");
    const where = status === "pending" ? { approved: false } : status === "approved" ? { approved: true } : {};

    // Spec #1: comments now hang off Content (relation name `parent`).
    // Project it back as `article` so the existing admin UI keeps reading
    // `comment.article.title / .slug` without a rename.
    const rows = await prisma.comment.findMany({
      where,
      include: { parent: { select: { title: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const comments = rows.map(({ parent, ...rest }) => ({ ...rest, article: parent }));
    return NextResponse.json(comments);
  } catch (error) {
    return apiError(error);
  }
}
