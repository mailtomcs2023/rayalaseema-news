import { NextRequest, NextResponse } from "next/server";
import { prisma, categoryUpdateSchema } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const rawBody = await req.json();
    const parsed = categoryUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const b = parsed.data as Record<string, any>;
    const data: any = {};
    for (const key of ["name", "nameEn", "slug", "color", "description", "sortOrder", "active", "parentId"] as const) {
      if (b[key] !== undefined) data[key] = b[key];
    }
    const cat = await prisma.category.update({ where: { id }, data });
    return NextResponse.json(cat);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
