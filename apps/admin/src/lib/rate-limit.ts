import { NextRequest, NextResponse } from "next/server";

// In-process IP-keyed rate limiter for auth endpoints.
//
// Token-bucket: every IP gets `max` requests per `windowMs`; when the bucket
// is empty, requests get a 429 with a `Retry-After` header. Counters live in
// a Map and self-expire so memory stays bounded.
//
// Limitations: a single process - fine for the current single-instance Azure
// App Service deploy. If we ever scale out horizontally, swap the Map for a
// Redis-backed store and the rest of the call sites stay the same.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic sweep - drops expired buckets so the Map can't grow forever from
// transient IPs hitting the endpoint once. Runs every 5 minutes.
const SWEEP_MS = 5 * 60_000;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
function scheduleSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }, SWEEP_MS);
  // Allow the process to exit cleanly in tests/scripts.
  if (typeof sweepTimer === "object" && sweepTimer && "unref" in sweepTimer) {
    (sweepTimer as unknown as { unref: () => void }).unref();
  }
}

function getClientIp(req: NextRequest): string {
  // Azure App Service / typical reverse-proxy fronts: X-Forwarded-For is a
  // comma-separated list with the original client first.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  const xreal = req.headers.get("x-real-ip");
  if (xreal) return xreal.trim();
  // NextRequest doesn't expose req.ip in all runtimes - fall back to a stable
  // bucket name so the limiter at least counts unknown-IP traffic together.
  return "unknown";
}

export interface RateLimitOptions {
  /** Maximum requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Namespace so endpoints don't share a bucket. */
  prefix: string;
}

/**
 * Checks the limiter and returns a 429 NextResponse if the request should be
 * blocked, or null if it's allowed through.
 *
 * Usage:
 *   const blocked = checkRateLimit(req, { max: 5, windowMs: 60_000, prefix: "reporter-login" });
 *   if (blocked) return blocked;
 */
export function checkRateLimit(
  req: NextRequest,
  opts: RateLimitOptions,
): NextResponse | null {
  scheduleSweep();
  const ip = getClientIp(req);
  const key = `${opts.prefix}:${ip}`;
  const now = Date.now();

  const existing = buckets.get(key);
  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }

  if (existing.count >= opts.max) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Please wait and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(opts.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(existing.resetAt / 1000)),
        },
      },
    );
  }

  existing.count += 1;
  return null;
}
