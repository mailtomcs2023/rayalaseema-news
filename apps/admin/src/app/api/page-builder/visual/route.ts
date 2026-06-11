// Visual pages (GrapesJS) - list + create.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// `prisma.visualPage` exists at runtime after `prisma generate`; cast so this
// typechecks even before the client is regenerated.
const db = prisma as unknown as {
  visualPage: {
    findMany: (a: unknown) => Promise<unknown[]>;
    create: (a: unknown) => Promise<{ id: string }>;
    findUnique: (a: unknown) => Promise<{ name: string; html: string | null; css: string | null; projectData: unknown } | null>;
  };
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function GET() {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const rows = await db.visualPage.findMany({
      select: { id: true, name: true, slug: true, isPublished: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(rows);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();

    // Clone: copy an existing page's design into a fresh DRAFT with a new
    // name/slug. Everything else (html/css/projectData) is duplicated.
    const cloneFromId = body?.cloneFromId ? String(body.cloneFromId) : "";
    let name: string;
    const data: Record<string, unknown> = {};
    if (cloneFromId) {
      const src = await db.visualPage.findUnique({
        where: { id: cloneFromId },
        select: { name: true, html: true, css: true, projectData: true },
      });
      if (!src) return NextResponse.json({ error: "source page not found" }, { status: 404 });
      name = String(body?.name || "").trim() || `${src.name} (copy)`;
      data.html = src.html;
      data.css = src.css;
      data.projectData = src.projectData ?? undefined;
    } else {
      name = String(body?.name || "").trim();
      if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const base = (body?.slug ? slugify(String(body.slug)) : slugify(name)) || "page";
    let slug = base;
    let n = 2;
    // Ensure a unique slug (repeated "Untitled page" → untitled-page-2, -3, …).
    while (await db.visualPage.findUnique({ where: { slug } })) {
      slug = `${base}-${n++}`;
    }
    const page = await db.visualPage.create({ data: { ...data, name, slug } });
    return NextResponse.json(page);
  } catch (e) {
    return apiError(e);
  }
}
