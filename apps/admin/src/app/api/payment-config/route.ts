import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const configs = await prisma.paymentConfig.findMany({ orderBy: { rate: "asc" } });
    return NextResponse.json(configs);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const b = await req.json();
    const data: any = {};
    for (const key of ["articleType", "name", "nameTE", "rate", "minWords", "requiresImage", "requiresVideo", "bonusRate", "active"] as const) {
      if (b[key] !== undefined) data[key] = b[key];
    }
    const config = await prisma.paymentConfig.upsert({
      where: { articleType: data.articleType },
      update: { name: data.name, nameTE: data.nameTE, rate: data.rate, minWords: data.minWords || 0, requiresImage: data.requiresImage || false, requiresVideo: data.requiresVideo || false, bonusRate: data.bonusRate || 0, active: data.active !== false },
      create: data,
    });
    return NextResponse.json(config);
  } catch (error) {
    return apiError(error);
  }
}
