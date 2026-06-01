// Server-side "what's this session's true state?" check.
//
// NextAuth's JWT is stateless - once issued, the cookie keeps whatever
// values were baked in at sign-in until it expires. To make admin actions
// take effect immediately (deletes, deactivations, mustChangePassword
// flips) every protected entry point re-reads the user from the DB:
//
//   - requireAuth() / requireCan() - covers every /api/* handler
//   - app/layout.tsx               - covers every page navigation
//
// Returns:
//   - { status: "gone" }                                  - deleted or inactive
//   - { status: "ok", mustChangePassword, role }          - live user
//
// React `cache()` dedupes the lookup so the same request pays for at most
// one DB hit even when layout + page + downstream code all call in.

import { cache } from "react";
import { prisma } from "@rayalaseema/db";

export type SessionState =
  | { status: "gone" }
  | { status: "ok"; mustChangePassword: boolean; role: string };

export const validateActiveSession = cache(
  async (userId: string | undefined | null): Promise<SessionState> => {
    if (!userId) return { status: "gone" };
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { active: true, mustChangePassword: true, role: true },
    });
    if (!u || !u.active) return { status: "gone" };
    return { status: "ok", mustChangePassword: u.mustChangePassword, role: u.role };
  },
);
