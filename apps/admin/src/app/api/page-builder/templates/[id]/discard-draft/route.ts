// Page Builder (Spec #2) — clear the in-progress draft. The next time the
// editor opens this template it sees the published layout again.

import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.template.update({ where: { id }, data: { draftLayout: Prisma.DbNull } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
