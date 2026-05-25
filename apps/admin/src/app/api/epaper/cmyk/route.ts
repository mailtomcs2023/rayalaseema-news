import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { convertPdfToCmyk, isCmykEnabled } from "@/lib/epaper/cmyk-pipe";
import { uploadBuffer } from "@/lib/blob";

// POST /api/epaper/cmyk — body { editionId }
//
// Converts edition.pdfUrl (sRGB from web render) to CMYK with optional press
// ICC profile via Ghostscript. Returns the CMYK PDF blob URL. #101.
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    if (!isCmykEnabled()) {
      return NextResponse.json({
        error: "CMYK pipeline not enabled",
        detail: "Set GHOSTSCRIPT_BIN env to /usr/bin/gs (apt install ghostscript). Optionally CMYK_ICC_PROFILE for press-grade gamut.",
      }, { status: 503 });
    }
    const body = await req.json();
    const editionId = body?.editionId as string;
    if (!editionId) return NextResponse.json({ error: "editionId required" }, { status: 400 });

    const edition = await prisma.epaperEdition.findUnique({ where: { id: editionId } });
    if (!edition?.pdfUrl) return NextResponse.json({ error: "Render the edition first" }, { status: 400 });

    const res = await fetch(edition.pdfUrl);
    if (!res.ok) return NextResponse.json({ error: "Failed to fetch source PDF" }, { status: 502 });
    const srcBytes = new Uint8Array(await res.arrayBuffer());

    const cmykBytes = await convertPdfToCmyk(srcBytes);
    const url = await uploadBuffer(Buffer.from(cmykBytes), "pdf", "application/pdf");
    return NextResponse.json({ ok: true, url, iccProfile: process.env.CMYK_ICC_PROFILE || "default" });
  } catch (e) { return apiError(e); }
}
