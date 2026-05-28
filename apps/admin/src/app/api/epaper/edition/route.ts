import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/epaper/edition?date=YYYY-MM-DD&variant=main
// Returns the v2 e-paper edition for that date. `variant` defaults to "main";
// district variants use slugs like "district-kurnool" - created via the
// /clone-variant endpoint and listed via ?listVariants=1.
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");
    if (!dateStr) return NextResponse.json({ error: "date required" }, { status: 400 });
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

    // ?listVariants=1 - returns the set of edition variants that exist for
    // this date so the editor can populate a variant picker.
    if (searchParams.get("listVariants") === "1") {
      const variants = await prisma.epaperEdition.findMany({
        where: { date },
        select: { id: true, edition: true, status: true, workflowState: true, pdfUrl: true, pageCount: true },
        orderBy: { edition: "asc" },
      });
      return NextResponse.json({ date: dateStr, variants });
    }

    const variant = searchParams.get("variant") || "main";
    const edition = await prisma.epaperEdition.findUnique({
      where: { date_edition: { date, edition: variant } },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });
    if (!edition) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      id: edition.id,
      date: dateStr,
      edition: edition.edition,
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
