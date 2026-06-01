// Builds an absolute URL for a redirect Location header that honours the
// reverse proxy in front of the Next.js server.
//
// Why this exists: in production, nginx terminates TLS for
// admin.rayalaseemanews.com and forwards to `http://localhost:3001`.
// `req.url` inside a Next.js handler reflects what the upstream sees, so
// `new URL("/foo", req.url)` produces `http://localhost:3001/foo` - which
// then ships back to the browser as the Location header and breaks every
// follow-up navigation (Chrome auto-upgrades localhost to HTTPS → SSL
// error; even without that, the user lands on a non-existent localhost
// from their machine).
//
// Resolution order:
//   1. NEXTAUTH_URL env (deploy.yml pins this to https://admin.rayalaseemanews.com)
//      — most reliable, doesn't depend on nginx forwarding any headers.
//   2. x-forwarded-host + x-forwarded-proto headers (if nginx forwards them).
//   3. The request's own Host header.
//   4. req.url as last-resort fallback (dev / direct hits to the upstream).
import type { NextRequest } from "next/server";

export function publicUrl(req: NextRequest | Request, path: string): URL {
  const envBase = process.env.NEXTAUTH_URL;
  if (envBase) {
    try {
      return new URL(path, envBase);
    } catch {
      // Malformed env - fall through to header-based detection.
    }
  }

  const headers = req.headers;
  const fwdHost = headers.get("x-forwarded-host");
  const host = fwdHost ?? headers.get("host");
  if (host && !/^localhost(:|$)/i.test(host)) {
    const proto = headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    return new URL(path, `${proto}://${host}`);
  }

  return new URL(path, req.url);
}
