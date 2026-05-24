import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { autofillTemplate, type BlockSlot } from "@/lib/epaper/autofill";
import { buildContinuations } from "@/lib/epaper/continuation";
import { createSnapshot } from "@/lib/epaper/snapshots";

// POST /api/epaper/generate-edition
// Body: { date: "YYYY-MM-DD" }
//
// Creates (or overwrites) the EpaperEdition for `date` by running the auto-fill
// engine across every active template, in template `sortOrder` order:
//   1. front
//   2. district-{kurnool, nandyal, ananthapuramu, sri-sathya-sai, ysr-kadapa,
//                annamayya, tirupati, chittoor}
//   3. section-{sports, cinema, editorial, classifieds}
//
// Each template → one EpaperPage with the populated layout JSON. Articles are
// not reused across pages.
//
// Operator then reviews the edition in the drag-swap editor and clicks
// Publish (which calls the existing render endpoint to produce the final PDF).
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    const dateStr = (body?.date as string) || new Date().toISOString().slice(0, 10);
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const templates = await prisma.epaperTemplate.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
    if (templates.length === 0) {
      return NextResponse.json({ error: "No active templates — run seed-epaper-templates.ts" }, { status: 400 });
    }

    // One main edition row per day. Per-district editions are now pages within
    // the same edition (v2 simplification — no more 9 separate EpaperEdition rows).
    const edition = await prisma.epaperEdition.upsert({
      where: { date_edition: { date, edition: "main" } },
      update: { status: "draft", pageCount: templates.length },
      create: {
        date,
        edition: "main",
        status: "draft",
        pageCount: templates.length,
        title: `${dateStr} Edition`,
      },
    });

    // If pages already exist, snapshot before wiping so a re-generate is
    // reversible from the History panel.
    const existingPageCount = await prisma.epaperPage.count({ where: { editionId: edition.id } });
    if (existingPageCount > 0) {
      await createSnapshot(edition.id, "pre-regenerate", { snappedById: session.user.id });
    }

    // Wipe any existing pages from a previous generate run.
    await prisma.epaperPage.deleteMany({ where: { editionId: edition.id } });

    const usedArticles = new Set<string>();
    const summary: Array<{ pageNumber: number; templateSlug: string; label: string; filled: number; unfilled: number }> = [];

    for (let i = 0; i < templates.length; i++) {
      const t = templates[i];
      const layout = (t.layout as unknown as { blocks: BlockSlot[] });

      const result = await autofillTemplate({
        templateSlug: t.slug,
        templateLayout: layout,
        templateRules: (t.fillRules as Record<string, unknown> | null) ?? undefined,
        excludeArticleIds: usedArticles,
      });

      for (const id of result.usedArticleIds) usedArticles.add(id);

      await prisma.epaperPage.create({
        data: {
          editionId: edition.id,
          pageNumber: i + 1,
          label: t.defaultLabel || t.name,
          templateSlug: t.slug,
          layout: { blocks: result.blocks } as any,
          imageUrl: "", // populated on render
        },
      });

      summary.push({
        pageNumber: i + 1,
        templateSlug: t.slug,
        label: t.defaultLabel || t.name,
        filled: result.filledCount,
        unfilled: result.unfilledSlotIds.length,
      });
    }

    // Post-process: scan the freshly autofilled pages, wire continuation
    // blocks on later pages for lead/major articles that overflow their slots.
    const continuationsCreated = await buildContinuations(edition.id);

    return NextResponse.json({
      editionId: edition.id,
      date: dateStr,
      pageCount: templates.length,
      usedArticles: usedArticles.size,
      continuationsCreated,
      pages: summary,
    });
  } catch (e) {
    return apiError(e);
  }
}
