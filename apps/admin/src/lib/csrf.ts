// CSRF protection via the Origin / Referer header check.
//
// Why this approach (and not double-submit-cookie tokens):
//   - Browsers automatically attach Origin on every cross-origin POST/PUT/
//     DELETE; checking host equality on the server catches the realistic
//     CSRF attack surface (a third-party page POSTing to our API).
//   - NextAuth session cookies are already SameSite=Lax, so cross-site
//     requests from a top-level navigation wouldn't carry auth anyway.
//     The Origin check closes the remaining XHR/fetch hole.
//   - Zero UI changes - fetch() includes Origin automatically.
//
// Webhook + bot routes that legitimately receive cross-origin POSTs (e.g.
// Stripe / Vercel cron / IndexNow callbacks) should be ALLOWED through
// the EXEMPT_PATH_PREFIXES list, then do their own signature verification.
import { NextRequest, NextResponse } from "next/server";

// Methods that mutate server state and therefore need CSRF protection. GET /
// HEAD / OPTIONS are intentionally NOT in this list - they should be
// side-effect-free per HTTP semantics.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Paths that bypass the Origin check because they have their own auth
// (signed webhooks, bearer-token mobile traffic, etc.). Pathnames are
// matched by prefix.
const EXEMPT_PATH_PREFIXES = [
  "/api/auth/", // NextAuth handles its own CSRF token internally
  // Mobile reporter app sends Authorization: Bearer <token> - no cookie
  // means no CSRF vector. The token itself is the auth. Bearer routes
  // bypass; cookie-auth routes go through.
  "/api/reporter-app/",
];

export interface CsrfOptions {
  /** Override the host check (rare - used in tests). */
  expectedHost?: string;
}

/**
 * Validate the Origin (or Referer as fallback) header on a mutating
 * request. Returns null when the request is safe to proceed, or a 403
 * NextResponse when it should be blocked.
 */
export function validateCsrf(req: NextRequest, opts: CsrfOptions = {}): NextResponse | null {
  // Read-only methods always pass.
  if (!MUTATING_METHODS.has(req.method)) return null;

  const { pathname } = new URL(req.url);
  if (EXEMPT_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  // Skip when there's no cookie auth - bearer-token requests bypass
  // automatically because they don't carry the session cookie that makes
  // CSRF possible. (NextAuth's cookie names start with either
  // `next-auth.session-token` or `__Secure-next-auth.session-token`.)
  const cookieHeader = req.headers.get("cookie") || "";
  const hasSession =
    cookieHeader.includes("next-auth.session-token") ||
    cookieHeader.includes("__Secure-next-auth.session-token");
  if (!hasSession) return null;

  const expectedHost = opts.expectedHost || req.headers.get("host");
  if (!expectedHost) {
    // No host header = can't verify. Block - better safe than sorry.
    return forbid("Missing Host header");
  }

  const originHeader = req.headers.get("origin");
  if (originHeader) {
    let originHost: string;
    try {
      originHost = new URL(originHeader).host;
    } catch {
      return forbid("Malformed Origin header");
    }
    if (originHost !== expectedHost) {
      return forbid(`Origin ${originHost} does not match host ${expectedHost}`);
    }
    return null;
  }

  // No Origin? Fall back to Referer (older browsers, some embedded webviews).
  const refererHeader = req.headers.get("referer");
  if (refererHeader) {
    let refererHost: string;
    try {
      refererHost = new URL(refererHeader).host;
    } catch {
      return forbid("Malformed Referer header");
    }
    if (refererHost !== expectedHost) {
      return forbid(`Referer ${refererHost} does not match host ${expectedHost}`);
    }
    return null;
  }

  // Neither Origin nor Referer + we have a session cookie = suspicious. Reject.
  return forbid("Missing Origin and Referer headers on cookie-authenticated request");
}

function forbid(reason: string): NextResponse {
  // Include the reason in dev to help debugging; production gets a generic
  // 403 so attackers don't learn what tripped the check.
  const body =
    process.env.NODE_ENV === "production"
      ? { error: "Forbidden" }
      : { error: "Forbidden", reason };
  return NextResponse.json(body, { status: 403 });
}
