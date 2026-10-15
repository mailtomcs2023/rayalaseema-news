import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { renewPressCard, PressCardIssueError, issueErrorStatus } from "@/lib/press-card/service";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  const { id } = await params;
  try {
    return NextResponse.json(await renewPressCard(id, session.user.id), { status: 201 });
  } catch (e) {
    if (e instanceof PressCardIssueError) return NextResponse.json({ error: e.message, code: e.code }, { status: issueErrorStatus(e.code) });
    return apiError(e);
  }
}
