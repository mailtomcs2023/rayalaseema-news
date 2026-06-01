"use client";

// Self-healing KYC session refresh.
//
// When an admin verifies a staff member's KYC, the change lands in the DB
// but NOT in that user's already-issued JWT - NextAuth tokens are stateless
// and there's no server-side push. Without this, a freshly-verified editor
// keeps seeing the "KYC must be verified" gate (useKycGate reads
// session.user.kycStatus off the token) until they fully log out and back
// in.
//
// This calls session.update(), which fires the jwt callback's
// `trigger === "update"` branch (lib/auth.ts) to re-read role + kycStatus
// from the DB and re-issue the token - no logout required. It runs:
//   - once when a non-verified, non-admin user lands on a dashboard page
//   - again whenever they refocus the tab (e.g. after the admin approved
//     them in another window)
// Once kycStatus flips to VERIFIED the component goes inert (the effect's
// guard returns early and the focus listener is torn down), so verified
// users and admins never trigger a refresh.

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

export function KycSessionRefresher() {
  const { data: session, update } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const kycStatus = (session?.user as { kycStatus?: string } | undefined)?.kycStatus;
  const needsRefresh = !!session && role !== "ADMIN" && kycStatus !== "VERIFIED";

  // Keep a stable handle to update() so the effect below depends only on
  // `needsRefresh` - re-running it on every render (update()'s identity can
  // change) would loop, since each update() re-renders.
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    if (!needsRefresh) return;
    void updateRef.current();
    const onFocus = () => void updateRef.current();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [needsRefresh]);

  return null;
}
