// Spec #3 F1 #185 — presence heartbeat for the menu editor.
//
// Single-process in-memory store. Two editors on the same location see each
// other via 10s heartbeats; entries older than 30s are evicted. The store is
// per-process (no Redis) — adequate for the admin app, which runs as one PM2
// instance. If we ever scale to multiple admin workers, swap in Redis.
//
// POST = heartbeat (current user pings). GET = list of OTHER active users.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

type Entry = { userId: string; name: string; lastSeen: number };

// Module-scope so the same Map survives between requests within the process.
const presence: Map<string, Map<string, Entry>> = new Map();

const TTL_MS = 30_000;

function getBucket(location: string): Map<string, Entry> {
  let bucket = presence.get(location);
  if (!bucket) {
    bucket = new Map();
    presence.set(location, bucket);
  }
  return bucket;
}

function evictStale(bucket: Map<string, Entry>) {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of bucket) if (v.lastSeen < cutoff) bucket.delete(k);
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ location: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { location } = await params;
    const bucket = getBucket(location);
    bucket.set(session.user.id, {
      userId: session.user.id,
      name: session.user.name || session.user.email || "Editor",
      lastSeen: Date.now(),
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return apiError(e); }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ location: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { location } = await params;
    const bucket = getBucket(location);
    evictStale(bucket);
    const others = [...bucket.values()].filter((e) => e.userId !== session.user.id);
    return NextResponse.json({ others });
  } catch (e) { return apiError(e); }
}
