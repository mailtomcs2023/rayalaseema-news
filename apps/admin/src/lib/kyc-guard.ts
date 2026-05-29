// Server-side KYC gate. Call from any API route that performs a
// VERIFIED-required action (content publish, payment claim, etc.).
//
// Returns null when the actor is cleared, or a NextResponse to short-
// circuit the route with a 403 + clear error message.
//
// Why a helper instead of inlining the lookup at every callsite:
//   - One place to change the policy ("VERIFIED only" vs. also allow
//     SUBMITTED after admin grace period vs. ignore for ADMINs).
//   - The route stays compact - `const block = await requireKyc(...); if
//     (block) return block;` is one line vs. ten lines of inline check.
//
// ADMIN is exempt by design - admins seed the system and shouldn't be
// locked out of publishing their own content before completing KYC
// themselves. Strip the ADMIN bypass below if your compliance policy
// requires everyone to complete KYC.

import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

interface Actor {
  id: string;
  role: string;
}

export async function requireKyc(actor: Actor, action = "publish"): Promise<NextResponse | null> {
  if (actor.role === "ADMIN") return null;

  const profile = await prisma.reporterProfile.findUnique({
    where: { userId: actor.id },
    select: { kycStatus: true },
  });

  // No profile row = treat as not-verified. Auto-create happens on user
  // creation now, so this only hits very old seeded accounts.
  if (!profile || profile.kycStatus !== "VERIFIED") {
    const status = profile?.kycStatus ?? "missing";
    return NextResponse.json(
      {
        error: `Your KYC must be VERIFIED to ${action}. Current status: ${status}.`,
        kycRequired: true,
        kycStatus: status,
      },
      { status: 403 },
    );
  }

  return null;
}
