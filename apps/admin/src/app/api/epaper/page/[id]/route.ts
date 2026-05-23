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
//   - { blocks: Block[] }                   replace whole layout
//   - { setArticle: { blockId, articleId } }   swap a single block's article
//   - { setLocked:  { blockId, locked } }      flip lock flag
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();

    const page = await prisma.epaperPage.findUnique({ where: { id } });
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    const layout = (page.layout as unknown as { blocks: Block[] }) ?? { blocks: [] };

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

    const updated = await prisma.epaperPage.update({
      where: { id },
      data: { layout: layout as any },
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
      ? await prisma.article.findMany({
          where: { id: { in: ids } },
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
