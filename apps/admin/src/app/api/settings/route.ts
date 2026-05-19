import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const configs = await prisma.siteConfig.findMany();
    const map: Record<string, string> = {};
    configs.forEach((c) => (map[c.key] = c.value));
    return NextResponse.json(map);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const body = await req.json();
    for (const [key, value] of Object.entries(body)) {
      await prisma.siteConfig.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
