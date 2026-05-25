import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    return NextResponse.json(await prisma.cartoon.findMany({ orderBy: { date: "desc" } }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const b = await req.json();
    return NextResponse.json(await prisma.cartoon.create({ data: { title: b.title, caption: b.caption, imageUrl: b.imageUrl, date: new Date(b.date || Date.now()) } }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
