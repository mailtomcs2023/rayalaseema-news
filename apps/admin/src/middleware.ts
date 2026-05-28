// Edge middleware - runs before every matched request. Currently does:
//   - CSRF guard on mutating /api/* requests (POST/PUT/PATCH/DELETE)
//
// Keep this file LIGHT. Anything heavy (DB queries, AI calls, complex
// auth) belongs inside the route handler, not the middleware - the
// matcher below runs on every request that touches an API route.
import { NextRequest, NextResponse } from "next/server";
import { validateCsrf } from "@/lib/csrf";

export function middleware(req: NextRequest) {
  const csrfBlock = validateCsrf(req);
  if (csrfBlock) return csrfBlock;
  return NextResponse.next();
}

// Only run on API routes. Static files, _next/*, and pages are unchanged.
// (The CSRF check itself bails out for non-mutating methods and for
// EXEMPT_PATH_PREFIXES inside the helper, so the matcher can be broad.)
export const config = {
  matcher: ["/api/:path*"],
};
