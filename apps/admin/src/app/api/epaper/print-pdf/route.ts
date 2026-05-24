import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// POST /api/epaper/print-pdf — body { editionId }
// CMYK + crop marks + 3 mm bleeds, suitable for handing to the press.
// Stub: returns 503 until Ghostscript or pdf-lib upgrade ships.
//
// To enable on prod:
//   1. apt-get install ghostscript (already on Ubuntu deploy hosts)
//   2. Pipe the existing /api/epaper/render-v2 output through:
//        gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite \
//           -sColorConversionStrategy=CMYK \
//           -dProcessColorModel=/DeviceCMYK \
//           -sOutputFile=<out>.pdf <in>.pdf
//   3. Add crop marks via pdf-lib annotations at each page corner (3 mm bleed
//      = 8.5 px @ 72 dpi; marks are 5 mm long).
//
// Tracking issue: #70.

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    return NextResponse.json({
      error: "Print-ready PDF not yet enabled",
      detail: "Needs Ghostscript on the deploy host for RGB→CMYK + pdf-lib annotations for crop marks. See /api/epaper/print-pdf comment block.",
      issue: "#70",
    }, { status: 503 });
  } catch (e) { return apiError(e); }
}
