import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const polls = await prisma.poll.findMany({
      include: { options: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(polls);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { question, options } = await req.json();
    if (!question || !options?.length) return NextResponse.json({ error: "Question and options required" }, { status: 400 });

    const poll = await prisma.poll.create({
      data: {
        question,
        options: { create: options.map((text: string) => ({ text })) },
      },
      include: { options: true },
    });
    return NextResponse.json(poll, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
