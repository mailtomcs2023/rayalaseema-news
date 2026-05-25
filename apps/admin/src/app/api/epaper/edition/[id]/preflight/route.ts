import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { collectIssues, blockingCount } from "@/lib/epaper/preflight";

// GET /api/epaper/edition/[id]/preflight
//
// Returns the merged preflight issue list for an edition. Drives the
// PreflightPanel (#139) + the publish workflow gate (#140).
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const issues = await collectIssues(id);
    return NextResponse.json({
      issues,
      total: issues.length,
      blocking: blockingCount(issues),
    });
  } catch (e) { return apiError(e); }
}
