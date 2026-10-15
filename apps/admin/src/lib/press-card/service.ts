// Issue / renew / revoke press cards. All DB writes go through a
// transaction that (a) re-checks "no ACTIVE card for this user" and (b)
// derives the next card number inside the same transaction, so two admins
// clicking Issue at once get one card + one 409, never two cards.
import crypto from "node:crypto";
import { prisma, Prisma, computePressCardStatus, nextCardNo, mintPressCardToken, defaultValidTill, type PressCardLiveStatus } from "@rayalaseema/db";
import { verifyUrlFor } from "./template";

export type PressCardIssueErrorCode =
  | "KYC_NOT_VERIFIED" | "NO_PHOTO" | "ALREADY_ACTIVE" | "NOT_FOUND" | "NOT_ACTIVE" | "CONFLICT";

export class PressCardIssueError extends Error {
  constructor(public code: PressCardIssueErrorCode, message: string) { super(message); }
}

/** HTTP status for a PressCardIssueError code - NOT_FOUND -> 404, everything else -> 409. */
export function issueErrorStatus(code: PressCardIssueErrorCode): 404 | 409 {
  return code === "NOT_FOUND" ? 404 : 409;
}

// Two concurrent issue/renew calls can both pass the in-transaction ACTIVE
// check and both compute the same next card number under READ COMMITTED.
// Running the transaction at Serializable turns the loser's commit into a
// P2034 (serialization failure) or P2002 (duplicate cardNo/token) instead of
// silently inserting a second card - this helper maps both into one clean
// CONFLICT error so routes still return 409, not a raw 500.
function isSerializationConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2002" || e.code === "P2034");
}

export type PressCardDto = {
  id: string; cardNo: string; token: string; name: string; designation: string; photoUrl: string;
  validFrom: string; validTill: string; status: "ACTIVE" | "REVOKED"; liveStatus: PressCardLiveStatus;
  revokedAt: string | null; revokeNote: string | null; userId: string | null; verifyUrl: string;
};

type Row = {
  id: string; cardNo: string; token: string; name: string; designation: string; photoUrl: string;
  validFrom: Date; validTill: Date; status: "ACTIVE" | "REVOKED"; revokedAt: Date | null; revokeNote: string | null;
  userId: string | null; user?: { lastWorkingDate: Date | null } | null;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

export function toDto(r: Row, now: Date = new Date()): PressCardDto {
  return {
    id: r.id, cardNo: r.cardNo, token: r.token, name: r.name, designation: r.designation, photoUrl: r.photoUrl,
    validFrom: day(r.validFrom), validTill: day(r.validTill), status: r.status,
    liveStatus: computePressCardStatus(r, now, r.user ?? undefined),
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null, revokeNote: r.revokeNote, userId: r.userId,
    verifyUrl: verifyUrlFor(r.token),
  };
}

export function issuableReason(
  profile: { kycStatus: string; photoUrl: string | null } | null,
  current: { liveStatus: PressCardLiveStatus } | null,
): "KYC_NOT_VERIFIED" | "NO_PHOTO" | "ALREADY_ACTIVE" | null {
  if (!profile || profile.kycStatus !== "VERIFIED") return "KYC_NOT_VERIFIED";
  if (!profile.photoUrl) return "NO_PHOTO";
  if (current && current.liveStatus === "ACTIVE") return "ALREADY_ACTIVE";
  return null;
}

const SELECT = {
  id: true, cardNo: true, token: true, name: true, designation: true, photoUrl: true, validFrom: true, validTill: true,
  status: true, revokedAt: true, revokeNote: true, userId: true, user: { select: { lastWorkingDate: true } },
} as const;

export async function getUserPressCard(userId: string): Promise<PressCardDto | null> {
  const r = await prisma.pressCard.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: SELECT });
  return r ? toDto(r) : null;
}

export async function getPressCardById(id: string): Promise<PressCardDto | null> {
  const r = await prisma.pressCard.findUnique({ where: { id }, select: SELECT });
  return r ? toDto(r) : null;
}

const secureRandom = () => crypto.randomInt(0, 1_000_000_000) / 1_000_000_000;

export async function issuePressCard(input: {
  userId: string; designation: string; validFrom?: Date; validTill?: Date; photoUrl?: string; issuedById: string;
}): Promise<PressCardDto> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, active: true, reporterProfile: { select: { kycStatus: true, photoUrl: true } } },
  });
  if (!user || !user.active) throw new PressCardIssueError("NOT_FOUND", "User not found or inactive");
  const current = await getUserPressCard(user.id);
  const reason = issuableReason(user.reporterProfile, current);
  if (reason) throw new PressCardIssueError(reason, reason === "KYC_NOT_VERIFIED" ? "KYC must be VERIFIED before a card is issued" : reason === "NO_PHOTO" ? "A passport photo is required" : "User already has an active card");
  const validFrom = input.validFrom ?? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const validTill = input.validTill ?? defaultValidTill(validFrom);
  const photoUrl = input.photoUrl || user.reporterProfile!.photoUrl!;

  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      // Same rule as issuableReason: a row only blocks a new issue if its
      // *derived* liveStatus is ACTIVE (REVOKED/SEPARATED/EXPIRED don't),
      // not merely "status column says ACTIVE and validTill hasn't passed".
      const rows = await tx.pressCard.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: SELECT });
      const now = new Date();
      if (rows.some((r) => computePressCardStatus(r, now, r.user ?? undefined) === "ACTIVE")) {
        throw new PressCardIssueError("ALREADY_ACTIVE", "User already has an active card");
      }
      const year = validFrom.getUTCFullYear();
      const nos = await tx.pressCard.findMany({ where: { cardNo: { startsWith: `RSN/${year}/` } }, select: { cardNo: true } });
      return tx.pressCard.create({
        data: {
          cardNo: nextCardNo(nos.map((n) => n.cardNo), year), token: mintPressCardToken(secureRandom),
          name: user.name, designation: input.designation.trim(), photoUrl, validFrom, validTill,
          userId: user.id, issuedById: input.issuedById,
        },
        select: SELECT,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof PressCardIssueError) throw e;
    if (isSerializationConflict(e)) throw new PressCardIssueError("CONFLICT", "Another issue/renew for this user is in progress; retry");
    throw e;
  }
  return toDto(row);
}

export async function revokePressCard(cardId: string, note: string): Promise<PressCardDto> {
  const r = await prisma.pressCard.findUnique({ where: { id: cardId }, select: { status: true } });
  if (!r) throw new PressCardIssueError("NOT_FOUND", "Card not found");
  if (r.status === "REVOKED") throw new PressCardIssueError("NOT_ACTIVE", "Card is already revoked");
  const row = await prisma.pressCard.update({ where: { id: cardId }, data: { status: "REVOKED", revokedAt: new Date(), revokeNote: note.trim() }, select: SELECT });
  return toDto(row);
}

export async function renewPressCard(cardId: string, issuedById: string): Promise<PressCardDto> {
  const old = await prisma.pressCard.findUnique({ where: { id: cardId }, select: { ...SELECT, issuedById: true } });
  if (!old || !old.userId) throw new PressCardIssueError("NOT_FOUND", "Card not found or not linked to a user");
  if (old.status === "REVOKED") throw new PressCardIssueError("NOT_ACTIVE", "Revoked cards cannot be renewed; issue a new card");
  const validFrom = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  let row;
  try {
    row = await prisma.$transaction(async (tx) => {
      const fresh = await tx.pressCard.findUnique({ where: { id: cardId }, select: { status: true } });
      if (!fresh || fresh.status !== "ACTIVE") throw new PressCardIssueError("NOT_ACTIVE", "Card already renewed");
      await tx.pressCard.update({ where: { id: cardId }, data: { status: "REVOKED", revokedAt: new Date(), revokeNote: "renewed" } });
      const year = validFrom.getUTCFullYear();
      const nos = await tx.pressCard.findMany({ where: { cardNo: { startsWith: `RSN/${year}/` } }, select: { cardNo: true } });
      return tx.pressCard.create({
        data: {
          cardNo: nextCardNo(nos.map((n) => n.cardNo), year), token: mintPressCardToken(secureRandom),
          name: old.name, designation: old.designation, photoUrl: old.photoUrl, validFrom, validTill: defaultValidTill(validFrom),
          userId: old.userId, issuedById, renewedFromId: old.id,
        },
        select: SELECT,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (e) {
    if (e instanceof PressCardIssueError) throw e;
    if (isSerializationConflict(e)) throw new PressCardIssueError("CONFLICT", "Another issue/renew for this user is in progress; retry");
    throw e;
  }
  return toDto(row);
}
