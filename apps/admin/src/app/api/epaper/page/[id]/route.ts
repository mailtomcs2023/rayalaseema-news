import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

interface Block {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  articleId?: string | null;
  locked?: boolean;
  content?: string;
  href?: string;
  targetPage?: number;
}

// PATCH /api/epaper/page/[id]
// Body shapes accepted:
//   - { blocks: Block[] }                           replace whole layout
//   - { setArticle: { blockId, articleId } }        swap a single block's article
//   - { setLocked:  { blockId, locked } }           flip lock flag
//
// All shapes accept an optional `expectedVersion: number` field. When present,
// the server compares it to the page's current `version` and returns 409 with
// the current version if they disagree — that's the conflict signal the
// editor uses to prompt a reload.
//
// On a successful write the response always includes the NEW `version` so the
// client can keep tracking it.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();

    const page = await prisma.epaperPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    // Optimistic concurrency check. If the client passes `expectedVersion` and
    // it doesn't match the current row, refuse the write — somebody else has
    // edited the page since this client last read it.
    if (typeof body?.expectedVersion === "number" && body.expectedVersion !== page.version) {
      return NextResponse.json(
        {
          error: "Conflict",
          code: "STALE_VERSION",
          message: `Page was edited by another user. Your version: ${body.expectedVersion}, current: ${page.version}.`,
          currentVersion: page.version,
        },
        { status: 409 },
      );
    }

    const layout = (page.layout as unknown as { coordSystem?: string; masterSlug?: string; blocks: Block[] }) ?? { blocks: [] };

    // v2 editor sends coordSystem + (optionally) masterSlug so we tag the
    // layout JSON and the renderer takes the mm-v2 path on next read.
    if (body?.coordSystem === "mm-v2" || body?.coordSystem === "grid-v1") {
      layout.coordSystem = body.coordSystem;
    }
    if (typeof body?.masterSlug === "string" || body?.masterSlug === null) {
      layout.masterSlug = body.masterSlug ?? undefined;
    }

    if (Array.isArray(body?.blocks)) {
      layout.blocks = body.blocks;
    } else if (body?.setArticle) {
      const { blockId, articleId } = body.setArticle as { blockId: string; articleId: string | null };
      const b = layout.blocks.find((x) => x.id === blockId);
      if (!b) return NextResponse.json({ error: "Block not found" }, { status: 404 });
      b.articleId = articleId || undefined;
    } else if (body?.setLocked) {
      const { blockId, locked } = body.setLocked as { blockId: string; locked: boolean };
      const b = layout.blocks.find((x) => x.id === blockId);
      if (!b) return NextResponse.json({ error: "Block not found" }, { status: 404 });
      b.locked = !!locked;
    } else {
      return NextResponse.json({ error: "Provide blocks | setArticle | setLocked" }, { status: 400 });
    }

    // Bump version atomically with the layout write. Using `increment` keeps it
    // race-safe even if two writes get here at the same moment — one will see
    // the bumped version and (if it passed expectedVersion) succeed, the
    // other's expectedVersion will now be stale on the NEXT request.
    const updated = await prisma.epaperPage.update({
      where: { id },
      data: {
        layout: layout as any,
        version: { increment: 1 },
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

// GET /api/epaper/page/[id] — full page with resolved article titles for the editor
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const page = await prisma.epaperPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });

    const layout = (page.layout as unknown as { blocks: Block[] }) ?? { blocks: [] };
    const ids = Array.from(new Set(layout.blocks.map((b) => b.articleId).filter((x): x is string => !!x)));
    const articles = ids.length
      ? await prisma.content.findMany({
          where: { type: "ARTICLE", id: { in: ids } },
          select: {
            id: true, slug: true, title: true, featuredImage: true,
            category: { select: { name: true, slug: true } },
            desk: { select: { name: true } },
          },
        })
      : [];

    return NextResponse.json({ page, articles });
  } catch (e) {
    return apiError(e);
  }
}
