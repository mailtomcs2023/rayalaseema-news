import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { imposePdf, impositionInfo, type FoldType } from "@/lib/epaper/imposition";
import { uploadBuffer } from "@/lib/blob";

// POST /api/epaper/imposed-pdf — body { editionId, foldType: "2up" | "4up" }
//
// Builds a press-ready imposed PDF from the edition's rendered pdfUrl.
// Press operator prints double-sided, folds in signatures, trims pages off
// the spine, and the booklet reads in reader order 1..N.
// #71.
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const editionId = body?.editionId as string;
    const foldType = (body?.foldType || "2up") as FoldType;
    if (!editionId) return NextResponse.json({ error: "editionId required" }, { status: 400 });
    if (foldType !== "2up" && foldType !== "4up") {
      return NextResponse.json({ error: "foldType must be '2up' or '4up'" }, { status: 400 });
    }

    const edition = await prisma.epaperEdition.findUnique({ where: { id: editionId } });
    if (!edition) return NextResponse.json({ error: "Edition not found" }, { status: 404 });
    if (!edition.pdfUrl) {
      return NextResponse.json({ error: "Render the edition first (no pdfUrl yet)" }, { status: 400 });
    }

    const res = await fetch(edition.pdfUrl);
    if (!res.ok) return NextResponse.json({ error: "Failed to fetch source PDF" }, { status: 502 });
    const srcBytes = new Uint8Array(await res.arrayBuffer());

    const imposed = await imposePdf(srcBytes, foldType);
    const info = impositionInfo(edition.pageCount || 1, foldType);
    const url = await uploadBuffer(Buffer.from(imposed), "pdf", "application/pdf");

    return NextResponse.json({ ok: true, url, foldType, info });
  } catch (e) { return apiError(e); }
}
