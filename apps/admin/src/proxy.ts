import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canVisit, landingFor } from "@/lib/roles";
import { validateCsrf } from "@/lib/csrf";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Expose the pathname to React server components via a request header.
  // Next.js intentionally doesn't surface the route in server components,
  // so layouts that need to react to the current path (e.g. hiding the
  // KYC banner on /onboarding/*) read this header from `headers()`.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const passthrough = NextResponse.next({ request: { headers: requestHeaders } });

  // CSRF guard - runs FIRST so a malicious cross-site POST can't slip
  // through any of the early returns below. The helper itself is a no-op
  // on GET/HEAD/OPTIONS and on exempt path prefixes (/api/auth/, the
  // mobile reporter bearer-token routes), so this is safe to call
  // unconditionally.
  const csrfBlock = validateCsrf(req);
  if (csrfBlock) return csrfBlock;

  // Allow these paths without auth
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png" ||
    pathname === "/logo-inverse.svg" ||
    pathname.startsWith("/uploads")
  ) {
    return passthrough;
  }

  // Check for any auth session cookie (AuthJS v5 uses different cookie names)
  const hasSession =
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token") ||
    req.cookies.has("next-auth.session-token") ||
    req.cookies.has("__Secure-next-auth.session-token");

  if (!hasSession) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based gate: decode the JWT and refuse off-limits routes for the
  // current role. Failures (no role, decode error) fall through to the
  // page, which is still protected by API-side requireAuth() checks.
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
      // AuthJS v5 cookie name (production prefixes with __Secure-).
      cookieName:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      secureCookie: process.env.NODE_ENV === "production",
    });
    const role = (token?.role as string | undefined) || undefined;

    // mustChangePassword used to be gated here too, but the JWT goes stale
    // immediately after a successful password change (NextAuth doesn't
    // refresh server-side, only on the next sign-in or session.update()).
    // The check now lives in app/layout.tsx where we can re-read the live
    // value from the DB - see lib/session-guard.ts.

    // KYC is NOT a navigation gate. Editors + sub-editors can browse every
    // page they're role-allowed to see, even before VERIFIED - the persistent
    // <AdminKycBanner /> tells them the current state, and the API-side
    // `requireKyc` guard blocks the actions that actually need verification
    // (publish, schedule, reporter content creation) with a 403 +
    // `kycRequired: true` that the UI translates into an actionable toast.
    // (REPORTERs get their own stricter mobile-app gate.)

    if (role && !canVisit(role, pathname)) {
      return NextResponse.redirect(new URL(landingFor(role), req.url));
    }
  } catch {
    // Decode failure - let the page handle it.
  }

  return passthrough;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-transparent.svg|logo-inverse.svg|logo.svg|uploads).*)"],
};
