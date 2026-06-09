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
    findUnique: (a: unknown) => Promise<unknown | null>;
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
    const name = String(body?.name || "").trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const base = (body?.slug ? slugify(String(body.slug)) : slugify(name)) || "page";
    let slug = base;
    let n = 2;
    // Ensure a unique slug (repeated "Untitled page" → untitled-page-2, -3, …).
    while (await db.visualPage.findUnique({ where: { slug } })) {
      slug = `${base}-${n++}`;
    }
    const page = await db.visualPage.create({ data: { name, slug } });
    return NextResponse.json(page);
  } catch (e) {
    return apiError(e);
  }
}
