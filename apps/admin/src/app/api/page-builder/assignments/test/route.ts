// Page Builder (Spec #2) — Test URL tool. Given a URL path, returns the
// assignment that would win (or null) using the shared resolver from
// packages/db (priority DESC → pattern length DESC tie-break).
//
//   GET /api/page-builder/assignments/test?url=/category/sports

import { NextRequest, NextResponse } from "next/server";
import { prisma, resolveAssignment } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const url = req.nextUrl.searchParams.get("url") || "";
    if (!url) return NextResponse.json({ error: "url query param required" }, { status: 400 });

    const rows = await prisma.templateAssignment.findMany({
      where: { active: true, template: { isPublished: true } },
      include: { template: { select: { id: true, name: true, slug: true, isPublished: true } } },
    });
    const winner = resolveAssignment(
      rows.map((r) => ({
        pattern: r.pattern,
        priority: r.priority,
        active: r.active,
        template: { isPublished: r.template.isPublished },
        _row: r,
      })),
      url,
    );
    return NextResponse.json({
      url,
      match: winner
        ? {
            id: (winner as { _row: typeof rows[number] })._row.id,
            pattern: winner.pattern,
            priority: winner.priority,
            template: (winner as { _row: typeof rows[number] })._row.template,
          }
        : null,
    });
  } catch (error) {
    return apiError(error);
  }
}
