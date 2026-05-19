import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const status = req.nextUrl.searchParams.get("status");
    const where = status === "pending" ? { approved: false } : status === "approved" ? { approved: true } : {};

    const comments = await prisma.comment.findMany({
      where,
      include: { article: { select: { title: true, slug: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(comments);
  } catch (error) {
    return apiError(error);
  }
}
