// HTTP caching helpers for read-only APIs.
//
// Wrap a JSON response with `cachedJson(req, body, opts)` to get:
//   - Strong ETag computed from the JSON body (FNV-1a 32-bit - cheap, no
//     external dep; collision probability is fine at the per-route scale
//     we deal in).
//   - 304 Not Modified when the client's If-None-Match matches.
//   - Cache-Control header with sane defaults (5s fresh, 60s SWR).
//
// Only safe for shared / public-shape responses. Endpoints whose body
// varies by user (auth-gated lists, role-filtered views) should NOT use
// this - set their own Cache-Control: private, no-store instead.
import { NextRequest, NextResponse } from "next/server";

export interface CacheOptions {
  /** Seconds the response stays fresh. Default 5. */
  maxAge?: number;
  /** Seconds the response may be served stale while a revalidate runs. Default 60. */
  staleWhileRevalidate?: number;
  /**
   * Cache scope:
   *   - "public"  - CDN + browser can both cache (default)
   *   - "private" - only the requesting client (used for auth-gated lists)
   */
  visibility?: "public" | "private";
}

function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Build a strong ETag from JSON-stringified `body`. Quoted per RFC 7232. */
export function buildEtag(body: unknown): string {
  return `"${fnv1a32(JSON.stringify(body))}"`;
}

/**
 * Wrap a JSON body in a cacheable NextResponse. Returns 304 when the
 * client's If-None-Match matches the computed ETag.
 */
export function cachedJson(
  req: NextRequest,
  body: unknown,
  opts: CacheOptions = {},
): NextResponse {
  const etag = buildEtag(body);
  const maxAge = opts.maxAge ?? 5;
  const swr = opts.staleWhileRevalidate ?? 60;
  const visibility = opts.visibility ?? "public";
  const cacheControl = `${visibility}, max-age=${maxAge}, stale-while-revalidate=${swr}`;

  const inm = req.headers.get("if-none-match");
  if (inm && inm === etag) {
    // 304: client already has the right body. Return empty + the same
    // ETag + Cache-Control so the cache entry stays valid.
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, "Cache-Control": cacheControl },
    });
  }

  return NextResponse.json(body, {
    headers: { ETag: etag, "Cache-Control": cacheControl },
  });
}
