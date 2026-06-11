// Visual page (GrapesJS) - save draft (projectData + exported html/css) and
// optionally publish. The editor calls this on Save / Publish.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

const db = prisma as unknown as {
  visualPage: {
    update: (a: unknown) => Promise<{ updatedAt: Date }>;
    delete: (a: unknown) => Promise<unknown>;
  };
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body?.projectData !== undefined) data.projectData = body.projectData;
    if (typeof body?.html === "string") data.html = body.html;
    if (typeof body?.css === "string") data.css = body.css;
    // `publish` accepts a boolean: true → publish (stamp publishedAt),
    // false → unpublish (clear it). Backward compatible with the old truthy use.
    if (typeof body?.publish === "boolean") {
      data.isPublished = body.publish;
      data.publishedAt = body.publish ? new Date() : null;
    } else if (body?.publish) {
      data.isPublished = true;
      data.publishedAt = new Date();
    }
    const page = await db.visualPage.update({ where: { id }, data });
    return NextResponse.json({ ok: true, updatedAt: page.updatedAt });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await db.visualPage.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
