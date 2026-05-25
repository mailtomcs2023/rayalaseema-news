import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { autofillTemplate, type BlockSlot } from "@/lib/epaper/autofill";

// POST /api/epaper/edition/[id]/clone-variant
// Body: { variantSlug: "district-kurnool" }
//
// Clones the source edition into a new variant for the same date. Front +
// section + back pages are deep-copied as-is (shared content across all
// editions of the day). District pages get re-autofilled with the variant's
// district slug so each city/district edition surfaces its own news.
//
// Variant slug convention: "district-<slug>" — matches the template
// fillRules.districtSlug for the district pages so the engine pulls correct
// articles for the variant.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "CHIEF_SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const variantSlug = (body?.variantSlug as string || "").trim();
    if (!variantSlug || !/^[a-z0-9-]+$/.test(variantSlug)) {
      return NextResponse.json({ error: "variantSlug required (lowercase, alphanumeric, dashes)" }, { status: 400 });
    }
    if (variantSlug === "main") {
      return NextResponse.json({ error: "'main' is reserved — pick a district slug" }, { status: 400 });
    }

    const source = await prisma.epaperEdition.findUnique({
      where: { id },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });
    if (!source) return NextResponse.json({ error: "Source edition not found" }, { status: 404 });

    // Refuse if variant already exists — clone is not a destructive op.
    const existing = await prisma.epaperEdition.findUnique({
      where: { date_edition: { date: source.date, edition: variantSlug } },
    });
    if (existing) return NextResponse.json({ error: `Variant '${variantSlug}' already exists for this date` }, { status: 409 });

    // Resolve which district this variant promotes — only relevant when
    // variantSlug starts with "district-". For city/zone variants the front
    // page stays as main's; only the district-template pages get re-filled.
    const districtFilterSlug = variantSlug.startsWith("district-")
      ? variantSlug.slice("district-".length)
      : null;

    // Create the variant edition row.
    const variant = await prisma.epaperEdition.create({
      data: {
        date: source.date,
        edition: variantSlug,
        title: `${source.title || "Edition"} — ${variantSlug}`,
        status: "draft",
        pageCount: source.pages.length,
      },
    });

    // Copy each page; for district-templated pages re-autofill with the
    // variant's district slug so the variant carries its own news.
    const usedArticleIds = new Set<string>();
    for (const p of source.pages) {
      let layout = JSON.parse(JSON.stringify(p.layout)) as { blocks: BlockSlot[] };
      const isDistrictPage = p.templateSlug.startsWith("district-");
      if (isDistrictPage && districtFilterSlug) {
        const result = await autofillTemplate({
          templateSlug: p.templateSlug,
          templateLayout: layout,
          templateRules: { districtSlug: districtFilterSlug },
          excludeArticleIds: usedArticleIds,
        });
        layout = { blocks: result.blocks };
        for (const a of result.usedArticleIds) usedArticleIds.add(a);
      } else {
        // Non-district pages keep their existing articleId assignments.
        for (const b of layout.blocks) {
          if (b.articleId) usedArticleIds.add(b.articleId);
        }
      }
      await prisma.epaperPage.create({
        data: {
          editionId: variant.id,
          pageNumber: p.pageNumber,
          label: p.label,
          templateSlug: p.templateSlug,
          layout: layout as any,
          imageUrl: "",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      variantId: variant.id,
      edition: variant.edition,
      pageCount: source.pages.length,
    });
  } catch (e) { return apiError(e); }
}
