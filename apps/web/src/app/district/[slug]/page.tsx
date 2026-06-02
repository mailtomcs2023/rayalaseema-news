// Legacy district route. Districts now live at the bare root slug (/kurnool,
// /tirupati) - next.config.js redirects() 301s /district/<slug> to /<slug>, so
// this route is normally intercepted before rendering. Kept as a safety net.
// Rendering is shared with the root resolver in @/lib/district-render.

import type { Metadata } from "next";
import { buildDistrictMetadata, DistrictView } from "@/lib/district-render";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildDistrictMetadata(slug);
}

export default async function DistrictPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DistrictView slug={slug} />;
}
