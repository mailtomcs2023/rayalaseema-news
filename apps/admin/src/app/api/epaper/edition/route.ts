import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/edition?date=YYYY-MM-DD
// Returns the v2 e-paper edition for that date (with its pages + layouts) so
// the editor can hydrate. 404 if none exists.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");
    if (!dateStr) return NextResponse.json({ error: "date required" }, { status: 400 });
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

    const edition = await prisma.epaperEdition.findUnique({
      where: { date_edition: { date, edition: "main" } },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });
    if (!edition) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      id: edition.id,
      date: dateStr,
      status: edition.status,
      workflowState: edition.workflowState,
      workflowNote: edition.workflowNote,
      pdfUrl: edition.pdfUrl,
      pageCount: edition.pageCount,
      pages: edition.pages,
    });
  } catch (e) {
    return apiError(e);
  }
}
