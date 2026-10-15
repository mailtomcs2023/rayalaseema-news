import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthError, apiError, zodErrorResponse } from "@/lib/api-utils";
import { revokePressCard, PressCardIssueError } from "@/lib/press-card/service";

const schema = z.object({ note: z.string().trim().min(3).max(200) }).strict();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  try {
    return NextResponse.json(await revokePressCard(id, parsed.data.note));
  } catch (e) {
    if (e instanceof PressCardIssueError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "NOT_FOUND" ? 404 : 409 });
    return apiError(e);
  }
}
