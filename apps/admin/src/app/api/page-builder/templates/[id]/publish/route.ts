// Page Builder (Spec #2) — publish draft.
//
//   POST /api/page-builder/templates/[id]/publish   { editNote? }
//
// 1. Re-validates the draft (or current layout if no draft) against the
//    shared Zod schema. Refuses to publish a malformed layout.
// 2. Snapshots the soon-to-be-published layout into TemplateVersion so
//    history (G1 #170) gets the entry automatically.
// 3. Copies draftLayout → layout, clears draftLayout, sets isPublished +
//    publishedAt.
// All three writes happen in a single Prisma transaction so a partial
// failure can't leave the template half-published.

import { NextRequest, NextResponse } from "next/server";
import { prisma, layoutSchema } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const editNote = body?.editNote ? String(body.editNote) : null;

    const tpl = await prisma.template.findUnique({ where: { id } });
    if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const candidate = tpl.draftLayout ?? tpl.layout;
    const parsed = layoutSchema.safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Cannot publish — layout is invalid", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      await tx.templateVersion.create({
        data: {
          templateId: id,
          layout: parsed.data as unknown as object,
          editedById: session.user.id,
          editNote,
        },
      });
      return tx.template.update({
        where: { id },
        data: {
          layout: parsed.data as unknown as object,
          draftLayout: null,
          isPublished: true,
          publishedAt: now,
        },
      });
    });

    return NextResponse.json({ ok: true, publishedAt: updated.publishedAt });
  } catch (error) {
    return apiError(error);
  }
}
