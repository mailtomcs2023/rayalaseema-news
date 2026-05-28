// /api/categories/[id]/suggested-tags - tag-suggestion chips for the editor.
//
// Source = curated seed (CategoryTagSuggestion rows with source = CURATED, written
// by the seeder lib on category creation + the deploy backfill) PLUS the
// top-5 tags that editors have actually attached to content in this category
// historically. The two lists are merged + deduped + ranked so the chip row
// surfaces both the curated AI baseline AND what the newsroom is actually
// using right now.
//
// No write side here - that's the seeder. This endpoint is read-only and
// any authenticated user can hit it (no role gate beyond the session check).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

interface SuggestedTag {
  id: string;
  name: string;
  slug: string;
  source: "CURATED" | "USAGE" | "BOTH";
  usageCount: number;
}

const USAGE_LIMIT = 5;
const MAX_RESULTS = 20;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const { id: categoryId } = await params;

    // Defensive: confirm the category exists so we 404 rather than returning
    // an empty list that looks indistinguishable from "no suggestions yet".
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // (1) AI seeds - curated baseline written by the seeder.
    const aiSeeds = await prisma.categoryTagSuggestion.findMany({
      where: { categoryId, source: "CURATED" },
      include: { tag: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "asc" },
    });

    // (2) Usage stats - the top-5 most common tags actually attached to
    // Content in this category. Includes both PRIMARY (Content.categoryId)
    // and cross-listed (ContentCategory) placements, because cross-listing
    // signals editorial intent for the secondary category too.
    const usageRows = await prisma.contentTag.groupBy({
      by: ["tagId"],
      where: {
        content: {
          OR: [
            { categoryId },
            { additionalCategories: { some: { categoryId } } },
          ],
        },
      },
      _count: { tagId: true },
      orderBy: { _count: { tagId: "desc" } },
      take: USAGE_LIMIT,
    });

    const usageTagIds = usageRows.map((r) => r.tagId);
    const usageTags = usageTagIds.length
      ? await prisma.tag.findMany({
          where: { id: { in: usageTagIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const usageById = new Map(usageTags.map((t) => [t.id, t]));
    const usageCountById = new Map(usageRows.map((r) => [r.tagId, r._count.tagId]));

    // Merge - start with AI seeds (preserving creation order), then layer in
    // usage rows. If a tag is in both lists upgrade its `source` to BOTH and
    // carry the usage count.
    const merged = new Map<string, SuggestedTag>();
    for (const s of aiSeeds) {
      merged.set(s.tag.id, {
        id: s.tag.id,
        name: s.tag.name,
        slug: s.tag.slug,
        source: "CURATED",
        usageCount: 0,
      });
    }
    for (const u of usageRows) {
      const tag = usageById.get(u.tagId);
      if (!tag) continue;
      const existing = merged.get(tag.id);
      if (existing) {
        existing.source = "BOTH";
        existing.usageCount = u._count.tagId;
      } else {
        merged.set(tag.id, {
          id: tag.id,
          name: tag.name,
          slug: tag.slug,
          source: "USAGE",
          usageCount: u._count.tagId,
        });
      }
    }

    // Sort: BOTH first (highest signal), then USAGE by count desc, then AI
    // seeds in their original creation order.
    const ranked = [...merged.values()].sort((a, b) => {
      const rank = (s: SuggestedTag["source"]) =>
        s === "BOTH" ? 0 : s === "USAGE" ? 1 : 2;
      const ra = rank(a.source);
      const rb = rank(b.source);
      if (ra !== rb) return ra - rb;
      if (a.source !== "CURATED" && b.source !== "CURATED") {
        return b.usageCount - a.usageCount;
      }
      return 0;
    });

    return NextResponse.json({
      categoryId,
      tags: ranked.slice(0, MAX_RESULTS),
    });
  } catch (error) {
    return apiError(error);
  }
}
