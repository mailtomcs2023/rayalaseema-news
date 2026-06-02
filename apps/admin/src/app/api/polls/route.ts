import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

export async function GET() {
  const session = await requireAuth();
  if (isAuthError(session)) return session;
  try {
    const polls = await prisma.poll.findMany({
      include: { options: { orderBy: { id: "asc" } } },
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
    const { question, options, allowMultiple, expiresAt } = await req.json();

    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "Question required" }, { status: 400 });
    }
    if (!Array.isArray(options) || options.filter((o) => typeof o === "string" && o.trim()).length < 2) {
      return NextResponse.json({ error: "At least 2 non-empty options required" }, { status: 400 });
    }
    // WhatsApp caps at 12 options. We follow suit so the widget stays usable.
    const cleaned = options.map((o: string) => o.trim()).filter(Boolean).slice(0, 12);

    let expires: Date | null = null;
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
      }
      expires = d;
    }

    const poll = await prisma.poll.create({
      data: {
        question: question.trim(),
        allowMultiple: Boolean(allowMultiple),
        expiresAt: expires,
        options: { create: cleaned.map((text) => ({ text })) },
      },
      include: { options: { orderBy: { id: "asc" } } },
    });
    return NextResponse.json(poll, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
