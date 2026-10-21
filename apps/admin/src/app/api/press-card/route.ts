import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError, zodErrorResponse } from "@/lib/api-utils";
import { issuePressCard, getUserPressCard, issuableReason, PressCardIssueError, issueErrorStatus } from "@/lib/press-card/service";

const ISSUERS = ["ADMIN", "EDITOR"] as const;
const dayRe = /^\d{4}-\d{2}-\d{2}$/;

// Reject dates that don't round-trip through UTC-midnight parsing (e.g.
// "2026-02-30") rather than silently storing whatever Date() coerces them to.
function isValidDay(s: string): boolean {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const issueSchema = z.object({
  userId: z.string().min(1),
  designation: z.string().trim().min(2).max(60),
  validFrom: z.string().regex(dayRe).optional(),
  validTill: z.string().regex(dayRe).optional(),
  photoUrl: z.string().url().max(500)
    .refine((u) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.core.windows.net");
      } catch {
        return false;
      }
    }, { message: "photoUrl must be an https Azure blob URL" })
    .optional(),
}).strict();

export async function GET(req: NextRequest) {
  const session = await requireAuth([...ISSUERS]);
  if (isAuthError(session)) return session;
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const [card, user] = await Promise.all([
    getUserPressCard(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, reporterProfile: { select: { kycStatus: true, photoUrl: true } } } }),
  ]);
  const reason = user ? issuableReason(user.reporterProfile, card) : "KYC_NOT_VERIFIED";
  // Any unlinked v1 card can be hand-picked and linked from the dialog -
  // most don't match the user's current name (renames, nicknames, OCR'd v1
  // seed data), so we no longer filter by exact name. Only offer linking
  // when the user doesn't already have an ACTIVE card (link route also
  // enforces this server-side). Exact-name matches are surfaced first so
  // the common case still shows at the top of the <select>.
  let unlinked: { id: string; cardNo: string; name: string }[] = [];
  if (user && card?.liveStatus !== "ACTIVE") {
    const rows = await prisma.pressCard.findMany({ where: { userId: null }, select: { id: true, cardNo: true, name: true } });
    unlinked = rows.sort((a, b) => {
      const aExact = a.name === user.name ? 0 : 1;
      const bExact = b.name === user.name ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.cardNo.localeCompare(b.cardNo);
    });
  }
  return NextResponse.json({ card, issuable: { ok: !reason, reason: reason ?? undefined }, unlinked });
}

export async function POST(req: NextRequest) {
  const session = await requireAuth([...ISSUERS]);
  if (isAuthError(session)) return session;
  const parsed = issueSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const b = parsed.data;
  if (b.validFrom && !isValidDay(b.validFrom)) return NextResponse.json({ error: "invalid date" }, { status: 400 });
  if (b.validTill && !isValidDay(b.validTill)) return NextResponse.json({ error: "invalid date" }, { status: 400 });
  if (b.validFrom && b.validTill && b.validTill < b.validFrom) {
    return NextResponse.json({ error: "validTill must be on or after validFrom" }, { status: 400 });
  }
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
