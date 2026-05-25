import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { rateLimit } from "@/lib/rate-limit";

// GET comments for a content row. The query string still accepts `articleId`
// as an alias for `contentId` so callers in flight (article page client
// components) keep working without a coordinated swap. Either param is fine.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const contentId = sp.get("contentId") || sp.get("articleId");
  if (!contentId) return NextResponse.json([]);

  const comments = await prisma.comment.findMany({
    where: { contentId, approved: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(comments, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=15" },
  });
}

// POST a new comment. Body accepts either `contentId` (preferred, Spec #1)
// or `articleId` (legacy alias).
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { maxRequests: 5, windowMs: 60_000, prefix: "comment" });
  if (limited) return limited;
  const body = await req.json();
  const contentId: string | undefined = body.contentId || body.articleId;
  const { name, email, content } = body;

  if (!contentId || !name?.trim() || !content?.trim()) {
    return NextResponse.json({ error: "Name and comment are required" }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: "Comment too long (max 2000 chars)" }, { status: 400 });
  }

  await prisma.comment.create({
    data: {
      contentId,
      name: name.trim(),
      email: email?.trim() || null,
      content: content.trim(),
      approved: false, // needs moderation
    },
  });

  return NextResponse.json({ success: true, message: "Comment submitted for moderation" });
}
