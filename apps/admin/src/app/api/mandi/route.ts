import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    // Returns BOTH active and inactive so the admin /mandi page can render
    // the Active / Inactive / All tabs against one fetch. Public consumers
    // (web /api/mandi, /api/tickers) filter by active themselves.
    const prices = await prisma.mandiPrice.findMany({
      orderBy: [{ date: "desc" }, { commodity: "asc" }],
      take: 250,
    });
    return NextResponse.json(prices);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const b = await req.json();
    const data: any = {};
    for (const key of ["commodity", "commodityEn", "market", "marketEn", "price", "unit", "change", "date", "active"] as const) {
      if (b[key] !== undefined) data[key] = b[key];
    }
    const price = await prisma.mandiPrice.create({ data });
    return NextResponse.json(price, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
