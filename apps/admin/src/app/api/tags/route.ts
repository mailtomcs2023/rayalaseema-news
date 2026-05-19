import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 80);
}

// GET /api/tags — list tags w/ article counts
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const tags = await prisma.tag.findMany({
      where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
      include: { _count: { select: { articles: true } } },
      orderBy: { name: "asc" },
      take: 200,
    });
    return NextResponse.json({ tags });
  } catch (e) { return apiError(e); }
}

// POST /api/tags — create (or return existing) by name
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;
  try {
    const { name } = await req.json();
    if (!name || !name.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const cleanName = name.trim();
    const slug = slugify(cleanName);
    if (!slug) return NextResponse.json({ error: "Invalid tag name" }, { status: 400 });

    const tag = await prisma.tag.upsert({
      where: { slug },
      update: {},
      create: { name: cleanName, slug },
    });

    await logAudit({
      action: "tag.create",
      resource: "tag",
      resourceId: tag.id,
      meta: { name: tag.name, slug: tag.slug },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (e) { return apiError(e); }
}
