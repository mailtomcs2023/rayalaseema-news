import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, zodErrorResponse } from "@/lib/api-utils";
const schema = z.object({ userId: z.string().min(1) }).strict();
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const card = await prisma.pressCard.findUnique({ where: { id }, select: { userId: true } });
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (card.userId) return NextResponse.json({ error: "Card already linked" }, { status: 409 });
  await prisma.pressCard.update({ where: { id }, data: { userId: parsed.data.userId } });
  return NextResponse.json({ ok: true });
}
