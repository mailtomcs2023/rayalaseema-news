import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { renderEpaperPageById } from "@/lib/epaper/render-layout";

// GET /api/epaper/page/[id]/preview
// Returns the page's rendered HTML for the live-preview iframe in the editor.
// No Playwright in this path — the browser does the heavy rendering itself,
// so updates are near-instant. The editor cache-busts by appending
// `?v={page.version}` so every PATCH that bumps version invalidates the iframe.
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const page = await prisma.epaperPage.findUnique({ where: { id }, select: { id: true } });
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    const html = await renderEpaperPageById(id);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Don't cache — the editor needs fresh HTML on every PATCH-driven reload.
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
