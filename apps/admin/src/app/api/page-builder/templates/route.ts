// Page Builder (Spec #2) - templates collection endpoint.
//
//   GET  → list templates with active-assignment URLs + version count
//          (any signed-in admin session can read)
//   POST → create a new template (ADMIN + EDITOR)
//          body: { name, slug, description?, cloneFromId? }
//          cloneFromId copies the source template's (draftLayout ?? layout)
//          into the new template's layout + isPublished=false.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

const EMPTY_LAYOUT = { version: 1, blocks: [] };

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
    const rows = await prisma.template.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { versions: true, assignments: true } },
        assignments: { where: { active: true }, select: { pattern: true } },
        createdBy: { select: { name: true } },
      },
    });
    const list = rows.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      isPublished: t.isPublished,
      publishedAt: t.publishedAt,
      hasDraft: t.draftLayout !== null,
      versionCount: t._count.versions,
      assignmentCount: t._count.assignments,
      patterns: t.assignments.map((a) => a.pattern),
      createdBy: t.createdBy?.name || "-",
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
    return NextResponse.json(list);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const slug = (body.slug ? String(body.slug) : slugify(name)) || `template-${Date.now()}`;

    const existing = await prisma.template.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: `Slug "${slug}" is already in use` },
        { status: 409 },
      );
    }

    let layout: unknown = EMPTY_LAYOUT;
    if (body.cloneFromId) {
      const src = await prisma.template.findUnique({
        where: { id: String(body.cloneFromId) },
        select: { layout: true, draftLayout: true },
      });
      if (!src) {
        return NextResponse.json({ error: "Template to clone not found" }, { status: 404 });
      }
      layout = src.draftLayout ?? src.layout;
    }

    const t = await prisma.template.create({
      data: {
        name,
        slug,
        description: body.description ? String(body.description) : null,
        layout: layout as object,
        isPublished: false,
        createdById: session.user.id,
      },
    });
    return NextResponse.json(t, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
