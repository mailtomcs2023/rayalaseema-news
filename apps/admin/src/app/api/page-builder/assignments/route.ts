// Page Builder (Spec #2) - assignments collection endpoint.
//   GET  → list (joined with template name + publish state) - any session
//   POST → create - ADMIN + EDITOR
//          body: { templateId, pattern, priority?, active? }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const rows = await prisma.templateAssignment.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      include: {
        template: { select: { id: true, name: true, slug: true, isPublished: true } },
      },
    });
    return NextResponse.json(rows);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const templateId = String(body.templateId || "");
    const pattern = String(body.pattern || "").trim();
    if (!templateId || !pattern) {
      return NextResponse.json(
        { error: "templateId and pattern are required" },
        { status: 400 },
      );
    }

    const tpl = await prisma.template.findUnique({ where: { id: templateId } });
    if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const a = await prisma.templateAssignment.create({
      data: {
        templateId,
        pattern,
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 10,
        active: body.active ?? true,
      },
    });
    return NextResponse.json(a, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
