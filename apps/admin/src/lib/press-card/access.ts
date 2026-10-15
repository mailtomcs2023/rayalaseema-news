// Pure auth-matrix decision for the PDF download route, factored out so the
// matrix (token / holder / staff, blocked when not ACTIVE) can be
// unit-tested without a running dev server or browser cookies.
//
// Order matters: (1) a valid short-lived ?t= token for THIS card, (2) the
// holder (bearer token or reporter session) owning the card, (3) an
// ADMIN/EDITOR session. Holders are blocked once their card's liveStatus
// isn't ACTIVE (SEPARATED/REVOKED/EXPIRED); staff are never blocked.
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
