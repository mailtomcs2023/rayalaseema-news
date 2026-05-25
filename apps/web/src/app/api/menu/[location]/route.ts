// Public menu read endpoint (Spec #3 E1 #183). The Header / Footer /
// MobileMenu client components call this on mount to pick up the
// admin-published menu, falling back to their hardcoded items if the
// menu hasn't been seeded yet.
import { NextResponse } from "next/server";
import { getMenuItems } from "@/lib/menu";

export async function GET(_: Request, { params }: { params: Promise<{ location: string }> }) {
  const { location: slug } = await params;
  const upper = slug.toUpperCase();
  if (upper !== "HEADER" && upper !== "FOOTER" && upper !== "MOBILE") {
    return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  }
  const items = await getMenuItems(upper as "HEADER" | "FOOTER" | "MOBILE");
  return NextResponse.json({ items }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
