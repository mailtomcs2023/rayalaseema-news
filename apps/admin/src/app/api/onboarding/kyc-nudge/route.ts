// GET /api/onboarding/kyc-nudge - sets the "kyc_nudge_seen" cookie and
// 302-redirects to /onboarding/kyc.
//
// Why a Route Handler: Next.js 15+ forbids cookie writes from Server
// Components (and therefore from page.tsx). The dashboard page detects
// the "first PENDING staff visit" condition and redirects HERE; this
// handler is the only place allowed to set the suppression cookie.
//
// Auth: this is gated by the proxy.ts auth check already (any
// authenticated user can hit it). No additional checks needed -
// setting the suppression cookie is harmless even if hit directly.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  cookieStore.set("kyc_nudge_seen", "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
    sameSite: "lax",
  });
  return NextResponse.redirect(new URL("/onboarding/kyc", req.url));
}
