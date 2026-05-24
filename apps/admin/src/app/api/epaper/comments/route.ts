import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/comments?editionId=...&unresolvedOnly=1
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId required" }, { status: 400 });
    const unresolvedOnly = sp.get("unresolvedOnly") === "1";

    const rows = await prisma.epaperComment.findMany({
      where: {
        editionId,
        ...(unresolvedOnly ? { resolved: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true } } },
      take: 500,
    });
    return NextResponse.json({ comments: rows });
  } catch (e) { return apiError(e); }
}

// POST /api/epaper/comments
// Body: { editionId, pageId, blockId?, text }
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const { editionId, pageId, blockId, text } = body;
    if (!editionId || !pageId || !text?.trim()) {
      return NextResponse.json({ error: "editionId + pageId + text required" }, { status: 400 });
    }
    const c = await prisma.epaperComment.create({
      data: {
        editionId, pageId,
        blockId: blockId || null,
        text: String(text).trim(),
        authorId: session.user.id,
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return NextResponse.json(c, { status: 201 });
  } catch (e) { return apiError(e); }
}
