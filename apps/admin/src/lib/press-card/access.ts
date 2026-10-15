// Pure auth-matrix decision for the PDF download route, factored out so the
// matrix (token / staff / holder, blocked when not ACTIVE) can be
// unit-tested without a running dev server or browser cookies.
//
// Order matters: (1) a valid short-lived ?t= token for THIS card, (2) an
// ADMIN/EDITOR session, (3) the holder (bearer token or reporter session)
// owning the card. Staff is checked before the holder because staff is
// never gated by liveStatus, while the holder check below denies once the
// card's liveStatus isn't ACTIVE (SEPARATED/REVOKED/EXPIRED) - checking staff
// first means an admin can always reach a non-ACTIVE card even if they also
// happen to be its holder.
import type { PressCardLiveStatus } from "@rayalaseema/db";

export type AccessInput = {
  cardId: string;
  cardUserId: string | null;
  liveStatus: PressCardLiveStatus;
  tokenCardId: string | null;
  holderId: string | null;
  role: string | undefined;
};

export type AccessDecision = { allowed: boolean; staff: boolean; reason?: string };

export function decideAccess(input: AccessInput): AccessDecision {
  const { cardId, cardUserId, liveStatus, tokenCardId, holderId, role } = input;

  if (tokenCardId && tokenCardId === cardId) return { allowed: true, staff: false };

  const isStaff = role === "ADMIN" || role === "EDITOR";
  if (isStaff) return { allowed: true, staff: true };

  const isHolder = !!holderId && holderId === cardUserId;
  if (isHolder) {
    if (liveStatus !== "ACTIVE") return { allowed: false, staff: false, reason: liveStatus };
    return { allowed: true, staff: false };
  }

  return { allowed: false, staff: false };
}
