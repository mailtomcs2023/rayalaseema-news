import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

async function updateAd(req: NextRequest, params: Promise<{ id: string }>) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const b = await req.json();
    const data: any = {};
    for (const key of ["name", "position", "imageUrl", "linkUrl", "htmlContent", "bgColor", "textColor", "active"] as const) {
      if (b[key] !== undefined) data[key] = b[key];
    }
    // Page targeting - normalize "" to null (global).
    if (b.targetPath !== undefined) data.targetPath = b.targetPath?.trim() || null;
    // Schedule columns - accept ISO date string or yyyy-mm-dd; nullable.
    for (const key of ["startDate", "endDate"] as const) {
      if (b[key] !== undefined) data[key] = b[key] ? new Date(b[key]) : null;
    }
    return NextResponse.json(await prisma.ad.update({ where: { id }, data }));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return updateAd(req, params);
}

// PATCH does the same partial-update semantics as PUT - admin UIs vary on
// which verb they send, so we accept both rather than forcing one.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return updateAd(req, params);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.ad.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
