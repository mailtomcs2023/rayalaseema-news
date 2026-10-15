import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getReporterId } from "@/lib/reporter-auth";
import { getUserPressCard, issuableReason } from "@/lib/press-card/service";
import { createDownloadToken } from "@/lib/press-card/download-token";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await getReporterId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [card, user] = await Promise.all([
    getUserPressCard(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { reporterProfile: { select: { kycStatus: true, photoUrl: true } } } }),
  ]);
  const reason = issuableReason(user?.reporterProfile ?? null, card);
  const origin = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  const downloadUrl = card && card.liveStatus === "ACTIVE" ? `${origin}/api/press-card/${card.id}/pdf?t=${createDownloadToken(card.id)}` : null;
  return NextResponse.json({ card, issuable: { ok: !reason, reason: reason ?? undefined }, downloadUrl });
}
