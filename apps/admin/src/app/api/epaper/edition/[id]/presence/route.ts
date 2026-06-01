import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { heartbeat, getPresence, subscribe } from "@/lib/epaper/presence";

// POST /api/epaper/edition/[id]/presence - body { pageId? }
// Sent as a periodic heartbeat from the editor (every 10 s) + on page change.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    heartbeat(id, session.user.id, session.user.name || session.user.email || "Editor", body?.pageId || null);
    return NextResponse.json({ peers: getPresence(id) });
  } catch (e) { return apiError(e); }
}

// GET /api/epaper/edition/[id]/presence - Server-Sent Events stream that
// pushes a fresh presence snapshot every time a peer heartbeats.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  const { id } = await params;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (payload: unknown) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      // Initial snapshot
      send(getPresence(id));
      const unsubscribe = subscribe(id, (peers) => send(peers));
      // Keep-alive every 25 s so proxies don't kill the connection
      const ka = setInterval(() => controller.enqueue(enc.encode(": ka\n\n")), 25_000);
      req.signal.addEventListener("abort", () => {
        clearInterval(ka);
        unsubscribe();
        try { controller.close(); } catch {}
      });
    },
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
