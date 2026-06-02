// Root single-segment resolver. This `page.tsx` sits on the existing root
// dynamic segment ([district]) - the same segment that powers article
// permalinks at /[district]/[constituency]/<slug-id> (depth 3). At DEPTH 1 it
// serves SECTION hubs at their bare slug (Eenadu-style):
//   - category  (e.g. /business, /sports)
//   - district  (e.g. /kurnool, /tirupati)
//
// Resolution order: static routes (e.g. /weather, /search) win automatically
// via Next.js precedence; then category, then district, else notFound().
// Categories and districts never share a slug, so order is just a tie-break.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@rayalaseema/db";
import { buildCategoryMetadata, CategoryView } from "@/lib/category-render";
import { buildDistrictMetadata, DistrictView } from "@/lib/district-render";

// Cheap existence check so generateMetadata and the page agree on what a slug
// resolves to without double-rendering. Category takes precedence over district.
async function classify(slug: string): Promise<"category" | "district" | null> {
  const [cat, dist] = await Promise.all([
    prisma.category.findUnique({ where: { slug }, select: { id: true } }),
    prisma.district.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (cat) return "category";
  if (dist) return "district";
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ district: string }>;
}): Promise<Metadata> {
  const { district: slug } = await params;
  const kind = await classify(slug);
  if (kind === "category") return buildCategoryMetadata(slug);
  if (kind === "district") return buildDistrictMetadata(slug);
  return {};
}

export default async function RootSectionPage({
  params,
}: {
  params: Promise<{ district: string }>;
}) {
  const { district: slug } = await params;
  const kind = await classify(slug);
  if (kind === "category") return <CategoryView slug={slug} />;
  if (kind === "district") return <DistrictView slug={slug} />;
  return notFound();
}
