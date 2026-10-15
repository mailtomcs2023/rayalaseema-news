import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError, zodErrorResponse } from "@/lib/api-utils";
import { issuePressCard, getUserPressCard, issuableReason, PressCardIssueError, issueErrorStatus } from "@/lib/press-card/service";

const ISSUERS = ["ADMIN", "EDITOR"] as const;
const dayRe = /^\d{4}-\d{2}-\d{2}$/;
const issueSchema = z.object({
  userId: z.string().min(1),
  designation: z.string().trim().min(2).max(60),
  validFrom: z.string().regex(dayRe).optional(),
  validTill: z.string().regex(dayRe).optional(),
  photoUrl: z.string().url().max(500).optional(),
}).strict();

export async function GET(req: NextRequest) {
  const session = await requireAuth([...ISSUERS]);
  if (isAuthError(session)) return session;
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const [card, user] = await Promise.all([
    getUserPressCard(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { reporterProfile: { select: { kycStatus: true, photoUrl: true } } } }),
  ]);
  const reason = user ? issuableReason(user.reporterProfile, card) : "KYC_NOT_VERIFIED";
  return NextResponse.json({ card, issuable: { ok: !reason, reason: reason ?? undefined } });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth([...ISSUERS]);
  if (isAuthError(session)) return session;
  const parsed = issueSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const b = parsed.data;
  try {
    const dto = await issuePressCard({
      userId: b.userId, designation: b.designation, photoUrl: b.photoUrl, issuedById: session.user.id,
      validFrom: b.validFrom ? new Date(`${b.validFrom}T00:00:00.000Z`) : undefined,
      validTill: b.validTill ? new Date(`${b.validTill}T00:00:00.000Z`) : undefined,
    });
    return NextResponse.json(dto, { status: 201 });
  } catch (e) {
    if (e instanceof PressCardIssueError) return NextResponse.json({ error: e.message, code: e.code }, { status: issueErrorStatus(e.code) });
    return apiError(e);
  }
}
