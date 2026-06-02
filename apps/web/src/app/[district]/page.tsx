// Root single-segment resolver. This `page.tsx` sits on the existing root
// dynamic segment ([district]) - the same segment that powers article
// permalinks at /[district]/[constituency]/<slug-id> (depth 3). At DEPTH 1 it
// serves category hubs at their bare slug (Eenadu-style: /business, /sports).
//
// We reuse the [district] folder because Next.js forbids a second differently-
// named dynamic segment at the same level. The param is therefore named
// `district` but, at this depth, it is a category slug.
//
// Resolution: static routes (e.g. /weather, /devotional, /search) win
// automatically via Next.js precedence, so they never reach here. A slug that
// isn't a category falls through to notFound() (districts keep their own
// /district/<slug> route, unchanged).

import type { Metadata } from "next";
import { buildCategoryMetadata, CategoryView } from "@/lib/category-render";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ district: string }>;
}): Promise<Metadata> {
  const { district: slug } = await params;
  return buildCategoryMetadata(slug);
}

export default async function RootCategoryPage({
  params,
}: {
  params: Promise<{ district: string }>;
}) {
  const { district: slug } = await params;
  // CategoryView calls notFound() when the slug is not a published category.
  return <CategoryView slug={slug} />;
}
