import { NextResponse } from "next/server";
import { getAdsByPosition } from "@/lib/db-queries";

// Public read-only feed for house ads by slot position. Powers the shared
// <RailAd> component (sidebar/rail ad cards). getAdsByPosition() already
// guards unknown positions and sanitizes htmlContent, so an arbitrary
// :position is safe - an unknown one just returns null (placeholder shows).

export async function GET(req: Request, { params }: { params: Promise<{ position: string }> }) {
  const { position } = await params;
  // Optional ?path=/nandyal restricts to a page-specific ad (falls back to a
  // global ad for the slot). The RailAd component sends the page it renders on.
  const path = new URL(req.url).searchParams.get("path");
  const ads = await getAdsByPosition(position, path);
  const ad = ads[0] ?? null;
  return NextResponse.json(
    { ad },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
