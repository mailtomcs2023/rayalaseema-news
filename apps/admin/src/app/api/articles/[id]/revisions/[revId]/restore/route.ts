import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

// POST /api/articles/[id]/revisions/[revId]/restore — overwrite article fields w/ snapshot
// Snapshots current state to a fresh revision first (so restore itself is reversible).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; revId: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id, revId } = await params;

    const [current, rev] = await Promise.all([
      prisma.article.findUnique({
        where: { id },
        select: { id: true, title: true, slug: true, summary: true, body: true, featuredImage: true, categoryId: true, status: true },
      }),
      prisma.articleRevision.findUnique({ where: { id: revId } }),
    ]);

    if (!current) return NextResponse.json({ error: "Article not found" }, { status: 404 });
    if (!rev || rev.articleId !== id) return NextResponse.json({ error: "Revision not found" }, { status: 404 });

    // Snapshot current state so restore is itself reversible
    await prisma.articleRevision.create({
      data: {
        articleId: id,
        title: current.title,
        slug: current.slug,
        summary: current.summary,
        body: current.body,
        featuredImage: current.featuredImage,
        categoryId: current.categoryId,
        status: current.status,
        editedById: session.user.id,
        editNote: `Auto-snapshot before restore of revision ${revId}`,
        bodyLength: current.body?.length || 0,
      },
    });

    // Apply revision data to current article. Slug uniqueness can fail if a different
    // article now uses this slug — return 409 in that case rather than silently corrupting.
    if (rev.slug !== current.slug) {
      const slugTaken = await prisma.article.findFirst({ where: { slug: rev.slug, NOT: { id } } });
      if (slugTaken) return NextResponse.json({ error: `Slug "${rev.slug}" is now used by another article — restore aborted` }, { status: 409 });
    }

    const restored = await prisma.article.update({
      where: { id },
      data: {
        title: rev.title,
        slug: rev.slug,
        summary: rev.summary,
        body: rev.body,
        featuredImage: rev.featuredImage,
        categoryId: rev.categoryId || undefined,
        // Don't restore status — keep current workflow position (don't unpublish accidentally)
      },
    });

    await logAudit({
      action: "article.restore",
      resource: "article",
      resourceId: id,
      meta: { revisionId: revId, restoredTitle: rev.title },
      actor: { id: session.user.id, email: session.user.email, role: (session.user as any).role },
      req,
    });

    return NextResponse.json({ ok: true, article: restored });
  } catch (error) {
    return apiError(error);
  }
}
