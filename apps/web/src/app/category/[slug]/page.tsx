// Legacy category route. Categories now live at the bare root slug (/business,
// /sports) - next.config.js redirects() 301s /category/<slug> to /<slug>, so
// this route is normally intercepted before rendering. Kept as a safety net
// (and so the page-builder "/category/*" template assignment still has a
// concrete route during the redirect handoff). Rendering is shared with the
// root resolver in @/lib/category-render.

import type { Metadata } from "next";
import { buildCategoryMetadata, CategoryHubView } from "@/lib/category-render";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildCategoryMetadata(slug);
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CategoryHubView slug={slug} />;
}
