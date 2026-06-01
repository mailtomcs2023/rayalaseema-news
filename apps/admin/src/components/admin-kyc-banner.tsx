// Card-style banner rendered on every (dashboard) page until the signed-in
// staff member's KYC reaches VERIFIED. Server component - reads fresh
// status from the DB on every nav so a freshly-verified user sees the
// banner disappear immediately.
//
// Pinned full-width to the BOTTOM of the viewport (fixed positioning,
// z-50), offset by the 240px sidebar on the left so it aligns with the
// page content gutter.
//
// Status palette (rendered by KycBannerClient):
//   PENDING    → amber, "Complete your KYC"
//   SUBMITTED  → blue,  "Documents submitted - under review"
//   REJECTED   → red,   "Action required" + rejection note
//   VERIFIED   → no banner (null)
//
// Missing profile row → treated as PENDING. This keeps the banner in sync
// with the client-side toast (useKycGate), which blocks any non-VERIFIED
// kycStatus.
//
// Dismissal: this server half also honours the `kyc_banner_dismissed`
// cookie set by the ✕ button (see kyc-banner-client.tsx). Reading it here -
// rather than only hiding on the client - means a dismissed banner never
// flashes on reload. The cookie value is the status it was dismissed at, so
// a status change re-surfaces the banner.

import { prisma } from "@rayalaseema/db";
import { cookies } from "next/headers";
import { KycBannerClient } from "./kyc-banner-client";

type KycStatus = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

export async function AdminKycBanner({ userId }: { userId: string }) {
  const profile = await prisma.reporterProfile.findUnique({
    where: { userId },
    select: { kycStatus: true, kycRejectionNote: true },
  });

  const status: KycStatus = (profile?.kycStatus as KycStatus) ?? "PENDING";
  if (status === "VERIFIED") return null;

  // Per-status dismissal: hide only while the cookie matches the status it
  // was dismissed at. A later status change has a different key, so e.g. a
  // dismissed "complete your KYC" doesn't silence a subsequent rejection.
  const dismissed = (await cookies()).get("kyc_banner_dismissed")?.value;
  if (dismissed === status) return null;

  return <KycBannerClient status={status} rejectionNote={profile?.kycRejectionNote ?? null} />;
}
