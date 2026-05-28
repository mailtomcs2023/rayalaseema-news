// Page Builder (Spec #2) - restore a TemplateVersion into the template's
// draftLayout (NOT the published layout). The operator reviews the
// restored draft in the editor and then publishes when ready.
//
//   POST /api/page-builder/templates/[id]/restore/[versionId]

import { NextRequest, NextResponse } from "next/server";
import { prisma, layoutSchema } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id, versionId } = await params;
    const version = await prisma.templateVersion.findUnique({ where: { id: versionId } });
    if (!version || version.templateId !== id) {
      return NextResponse.json({ error: "Version not found for this template" }, { status: 404 });
    }
    const parsed = layoutSchema.safeParse(version.layout);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Stored snapshot is malformed and cannot be restored", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    await prisma.template.update({
      where: { id },
      data: { draftLayout: parsed.data as unknown as object },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
