import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { regenerateField, type RegenField } from "@/lib/video-iq/regenerate";

// POST /api/video-iq/[id]/regenerate { field, current, instruction? }
// One model call that rewrites a single field with the score reasons and the
// editor's instruction in the prompt. Returns scored candidates; nothing is
// saved until the editor presses Save.
type Ctx = { params: Promise<{ id: string }> };
const FIELDS: RegenField[] = ["title", "description", "tags", "comment", "chapters", "hashtags"];
export const maxDuration = 120;

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(auth)) return auth;
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const field = body.field as RegenField;
    if (!FIELDS.includes(field)) return NextResponse.json({ error: `field must be one of ${FIELDS.join(", ")}` }, { status: 400 });
    const run = await prisma.videoOptimization.findUnique({ where: { id } });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!run.suggestions) return NextResponse.json({ error: "run the analysis first" }, { status: 409 });
    const instruction = typeof body.instruction === "string" ? body.instruction.slice(0, 500) : undefined;
    const result = await regenerateField({ field, run, current: body.current, instruction });
    return NextResponse.json(result);
  } catch (e) {
    if (/model output invalid/.test(String((e as Error).message))) return NextResponse.json({ error: "the model returned something unusable; try again" }, { status: 502 });
    return apiError(e);
  }
}
