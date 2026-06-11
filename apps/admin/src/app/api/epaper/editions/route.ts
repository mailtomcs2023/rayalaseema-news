import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/editions?limit=60
// Lists existing e-paper editions across ALL dates (newest first) so the editor
// can show a "Recent editions" panel instead of forcing the operator to guess a
// date in the picker. One row per [date, edition] variant.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 60, 1), 200);

    const rows = await prisma.epaperEdition.findMany({
      select: {
        id: true,
        date: true,
        edition: true,
        status: true,
        workflowState: true,
        pageCount: true,
        pdfUrl: true,
        updatedAt: true,
      },
      orderBy: [{ date: "desc" }, { edition: "asc" }],
      take: limit,
    });

    const editions = rows.map((r) => ({
      id: r.id,
      // @db.Date → serialize as YYYY-MM-DD (UTC slice matches how the editor
      // keys editions by date everywhere else).
      date: r.date.toISOString().slice(0, 10),
      edition: r.edition,
      status: r.status,
      workflowState: r.workflowState,
      pageCount: r.pageCount,
      pdfUrl: r.pdfUrl,
      updatedAt: r.updatedAt,
    }));

    return NextResponse.json({ editions });
  } catch (e) {
    return apiError(e);
  }
}
