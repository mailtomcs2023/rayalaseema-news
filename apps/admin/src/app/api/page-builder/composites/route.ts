// Page Builder (Spec #2) - composite blocks collection endpoint.
//   GET  → list (any session)
//   POST → create (ADMIN, EDITOR) - body: { name, slug?, description?, blocks? }
//          blocks defaults to [] if omitted; the visual editor (F1) populates it.

import { NextRequest, NextResponse } from "next/server";
import { prisma, compositeBlocksSchema } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const rows = await prisma.compositeBlock.findMany({
      orderBy: { updatedAt: "desc" },
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        blockCount: Array.isArray(r.blocks) ? (r.blocks as unknown[]).length : 0,
        createdBy: r.createdBy?.name || "-",
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const slug = (body.slug ? String(body.slug) : slugify(name)) || `composite-${Date.now()}`;

    if (await prisma.compositeBlock.findUnique({ where: { slug } })) {
      return NextResponse.json({ error: `Slug "${slug}" is already in use` }, { status: 409 });
    }

    let blocks: unknown[] = [];
    if (Array.isArray(body.blocks)) {
      const parsed = compositeBlocksSchema.safeParse(body.blocks);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid blocks payload", details: parsed.error.flatten() },
          { status: 400 },
        );
      }
      blocks = parsed.data;
    }

    const c = await prisma.compositeBlock.create({
      data: {
        name,
        slug,
        description: body.description ? String(body.description) : null,
        blocks: blocks as object,
        createdById: session.user.id,
      },
    });
    return NextResponse.json(c, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
