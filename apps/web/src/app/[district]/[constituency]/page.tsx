// Canonical constituency hub: /[district]/[constituency] (e.g. /kurnool/adoni).
// Sits under the district hub. Article permalinks live under /telugu-news/, so
// this bare-root 2-segment slot is free for the hub. The legacy
// /constituency/<slug> route 301s here. Rendering + the district-segment
// validation live in lib/constituency-render.tsx.
import type { Metadata } from "next";
import { buildConstituencyMetadata, ConstituencyView } from "@/lib/constituency-render";

// Re-render at most once a minute so newly tagged/published articles appear on
// the constituency hub instead of being frozen behind the full-route cache.
export const revalidate = 60;

type Params = Promise<{ district: string; constituency: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { district, constituency } = await params;
  return buildConstituencyMetadata(district, constituency);
}

export default async function ConstituencyHubPage({ params }: { params: Params }) {
  const { district, constituency } = await params;
  return <ConstituencyView districtSlug={district} constituencySlug={constituency} />;
}
