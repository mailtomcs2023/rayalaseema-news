// Page Builder (Spec #2) - save draft layout. Zod-validates the incoming
// layout JSON; rejects with 400 + zod issues on shape errors so the editor
// can surface them inline.
//
//   PUT /api/page-builder/templates/[id]/draft   { draftLayout }

import { NextRequest, NextResponse } from "next/server";
import { prisma, layoutSchema } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// (touch) layoutSchema now includes the Columns container block.

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body || typeof body !== "object" || body.draftLayout === undefined) {
      return NextResponse.json({ error: "draftLayout required" }, { status: 400 });
    }

    const parsed = layoutSchema.safeParse(body.draftLayout);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid layout", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const t = await prisma.template.update({
      where: { id },
      data: { draftLayout: parsed.data as unknown as object },
    });
    return NextResponse.json({ ok: true, updatedAt: t.updatedAt });
  } catch (error) {
    return apiError(error);
  }
}
