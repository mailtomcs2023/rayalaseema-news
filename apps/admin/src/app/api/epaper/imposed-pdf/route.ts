import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// POST /api/epaper/imposed-pdf — body { editionId, foldType: "4up" | "8up" }
// Press signature layout — rearranges PDF pages so a press operator can
// print double-sided + fold + trim into reader-page order. For a 32-page
// edition with 4-up folds the press receives pages [32,1, 2,31, 30,3, ...].
//
// Stub: returns 503 until imposition lib lands (pdf-lib has the page
// rearrange primitives; the imposition math itself is ~80 lines).
// Tracking issue: #71.

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    return NextResponse.json({
      error: "PDF imposition not yet enabled",
      detail: "Implement signature-layout math in apps/admin/src/lib/epaper/imposition.ts using pdf-lib's copyPages + addPage in the right order based on foldType. Total pages must be a multiple of foldType*2.",
      issue: "#71",
    }, { status: 503 });
  } catch (e) { return apiError(e); }
}
