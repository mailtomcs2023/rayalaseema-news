// In-process presence registry for the e-paper editor.
//
// Limitations to be honest about:
//   - Single-process only. Multi-instance deploys (Azure scale-out) will
//     see split brain — operator A on instance 1 doesn't see operator B on
//     instance 2. For our current 1-instance Azure VM this is acceptable.
//   - State lives in memory; restart wipes it (acceptable — clients refresh
//     within 10 s heartbeat anyway).
//   - Swapping to Pusher/Ably/Redis pub-sub is a one-file change to this
//     module; the rest of the codebase consumes the same Map.

interface PresenceEntry {
  userId: string;
  userName: string;
  pageId: string | null;
  lastSeen: number; // epoch ms
}

// editionId → (userId → entry)
const presence = new Map<string, Map<string, PresenceEntry>>();

// editionId → Set of broadcast callbacks (one per open SSE connection)
const subscribers = new Map<string, Set<(payload: PresenceEntry[]) => void>>();

function snapshot(editionId: string): PresenceEntry[] {
  const m = presence.get(editionId);
  if (!m) return [];
  const cutoff = Date.now() - 30_000; // drop stale entries
  for (const [uid, e] of m) {
    if (e.lastSeen < cutoff) m.delete(uid);
  }
  return Array.from(m.values());
}

export function heartbeat(editionId: string, userId: string, userName: string, pageId: string | null): void {
  let m = presence.get(editionId);
  if (!m) { m = new Map(); presence.set(editionId, m); }
  m.set(userId, { userId, userName, pageId, lastSeen: Date.now() });
  // Notify SSE subscribers
  const subs = subscribers.get(editionId);
  if (subs) {
    const payload = snapshot(editionId);
    for (const cb of subs) cb(payload);
  }
}

export function getPresence(editionId: string): PresenceEntry[] {
  return snapshot(editionId);
}

export function subscribe(editionId: string, cb: (payload: PresenceEntry[]) => void): () => void {
  let s = subscribers.get(editionId);
  if (!s) { s = new Set(); subscribers.set(editionId, s); }
  s.add(cb);
  return () => { s!.delete(cb); };
}
