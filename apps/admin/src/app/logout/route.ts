// Server-side sign-out endpoint.
//
// NextAuth's client `signOut()` works for normal user-initiated sign-outs,
// but we also need a SERVER-driven path so the root layout / API gates can
// bounce a deleted-or-deactivated user even when their browser tab hasn't
// run any JS yet (e.g. they reload a page and the JWT is still in the
// cookie but their User row is gone).
//
// Clears every NextAuth session-cookie variant (dev + prod), then redirects
// to /login. `?reason=...` is optional and just for the login page banner.

import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";

const COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  // CSRF + callback-url cookies are also part of NextAuth's set - wipe them
  // so a stale state can't leak into the next sign-in.
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
];

function clearAndRedirect(req: NextRequest): NextResponse {
  const url = publicUrl(req, "/login");
  const reason = req.nextUrl.searchParams.get("reason");
  if (reason) url.searchParams.set("reason", reason);
  const res = NextResponse.redirect(url);
  for (const name of COOKIE_NAMES) {
    res.cookies.set({ name, value: "", path: "/", maxAge: 0 });
  }
  return res;
}

export function GET(req: NextRequest) {
  return clearAndRedirect(req);
}

export function POST(req: NextRequest) {
  return clearAndRedirect(req);
}
