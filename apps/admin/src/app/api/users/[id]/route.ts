import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { hash } from "bcryptjs";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const b = await req.json();
    const data: any = {};
    for (const key of ["name", "email", "role", "active", "bio", "phone"] as const) {
      if (b[key] !== undefined) data[key] = b[key];
    }
    if (b.password) data.passwordHash = await hash(b.password, 12);

    const user = await prisma.user.update({ where: { id }, data });

    // Update category assignments
    if (b.categoryIds !== undefined) {
      // Remove old assignments
      await prisma.userCategory.deleteMany({ where: { userId: id } });
      // Add new
      if (b.categoryIds?.length) {
        for (const catId of b.categoryIds) {
          await prisma.userCategory.create({ data: { userId: id, categoryId: catId } }).catch(() => {});
        }
      }
    }

    return NextResponse.json(user);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.user.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
