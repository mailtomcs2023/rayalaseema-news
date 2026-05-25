import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

const ALLOWED_TYPES = ["FRONT", "DISTRICT", "SECTION", "BACK"] as const;

export async function GET(_: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const templates = await prisma.epaperTemplate.findMany({
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    });
    return NextResponse.json(templates);
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const { slug, name, type, defaultLabel, fillRules, layout, sortOrder, active } = body;
    if (!slug || !name || !type || !layout) {
      return NextResponse.json({ error: "slug, name, type, layout required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    const t = await prisma.epaperTemplate.create({
      data: {
        slug, name, type,
        defaultLabel: defaultLabel || null,
        fillRules: fillRules || null,
        layout,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        active: active !== false,
      },
    });
    return NextResponse.json(t, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
