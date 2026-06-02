import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

// GET /api/precious-metals
// Returns the most recent active + inactive rows so the admin page can
// render Active / Inactive / All views off one fetch. The public ticker
// in apps/web filters to active itself.
export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const rates = await prisma.preciousMetalRate.findMany({
      orderBy: [{ date: "desc" }, { city: "asc" }, { metal: "asc" }, { purity: "asc" }],
      take: 250,
    });
    return NextResponse.json(rates);
  } catch (error) {
    return apiError(error);
  }
}

// POST /api/precious-metals
// Creates a new rate row. The /gold-rate page + the homepage ticker read
// the latest row per (city, metal, purity), so adding a new row supersedes
// the previous one for that combination on the next request.
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const b = await req.json();
    if (!b.city || typeof b.city !== "string") {
      return NextResponse.json({ error: "City is required" }, { status: 400 });
    }
    if (b.metal !== "GOLD" && b.metal !== "SILVER") {
      return NextResponse.json({ error: "Metal must be GOLD or SILVER" }, { status: 400 });
    }
    const price = Number(b.pricePerGram);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "pricePerGram must be a positive number" }, { status: 400 });
    }
    // Gold rows require a purity (22K/24K). Silver typically has no purity.
    if (b.metal === "GOLD" && !b.purity) {
      return NextResponse.json({ error: "Gold rows require a purity (22K or 24K)" }, { status: 400 });
    }
    const created = await prisma.preciousMetalRate.create({
      data: {
        city: b.city.trim(),
        cityTe: b.cityTe ? String(b.cityTe).trim() : null,
        metal: b.metal,
        purity: b.purity ? String(b.purity).trim() : null,
        pricePerGram: price,
        unit: b.unit || "per gram",
        source: b.source ? String(b.source).trim() : null,
        active: b.active === undefined ? true : !!b.active,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
