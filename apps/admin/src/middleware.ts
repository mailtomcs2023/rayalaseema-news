import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { canVisit, landingFor } from "@/lib/roles";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow these paths without auth
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.svg" ||
    pathname === "/logo-inverse.svg" ||
    pathname === "/logo-transparent.svg" ||
    pathname.startsWith("/uploads")
  ) {
    return NextResponse.next();
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
    if (role && !canVisit(role, pathname)) {
      return NextResponse.redirect(new URL(landingFor(role), req.url));
    }
  } catch {
    // Decode failure — let the page handle it.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-transparent.svg|logo-inverse.svg|logo.svg|uploads).*)"],
};
