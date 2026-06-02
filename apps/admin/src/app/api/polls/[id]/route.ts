import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";

type IncomingOption = { id?: string; text: string };

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const body = await req.json();
    const { active, question, allowMultiple, expiresAt, options } = body as {
      active?: boolean;
      question?: string;
      allowMultiple?: boolean;
      expiresAt?: string | null;
      options?: IncomingOption[];
    };

    // Quick toggle path - the existing "active" pill still hits this route
    // with just { active }, so keep it cheap and skip the option diffing.
    if (
      typeof active === "boolean" &&
      question === undefined &&
      allowMultiple === undefined &&
      expiresAt === undefined &&
      options === undefined
    ) {
      const poll = await prisma.poll.update({ where: { id }, data: { active } });
      return NextResponse.json(poll);
    }

    const data: {
      active?: boolean;
      question?: string;
      allowMultiple?: boolean;
      expiresAt?: Date | null;
    } = {};

    if (typeof active === "boolean") data.active = active;
    if (typeof allowMultiple === "boolean") data.allowMultiple = allowMultiple;

    if (typeof question === "string") {
      if (!question.trim()) return NextResponse.json({ error: "Question cannot be empty" }, { status: 400 });
      data.question = question.trim();
    }

    if (expiresAt !== undefined) {
      if (expiresAt === null || expiresAt === "") {
        data.expiresAt = null;
      } else {
        const d = new Date(expiresAt);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
        }
        data.expiresAt = d;
      }
    }

    if (options === undefined) {
      const poll = await prisma.poll.update({
        where: { id },
        data,
        include: { options: { orderBy: { id: "asc" } } },
      });
      return NextResponse.json(poll);
    }

    // Full option diff. Editors may rename, add, or remove options.
    // Deleting an option cascades its PollVote rows, which is the price of
    // an edit - matches WhatsApp's "edit poll = reset that branch" feel.
    if (!Array.isArray(options) || options.filter((o) => o?.text?.trim()).length < 2) {
      return NextResponse.json({ error: "At least 2 non-empty options required" }, { status: 400 });
    }
    const cleaned = options
      .filter((o) => o?.text?.trim())
      .map((o) => ({ id: o.id, text: o.text.trim() }))
      .slice(0, 12);

    const existing = await prisma.pollOption.findMany({ where: { pollId: id }, select: { id: true } });
    const existingIds = new Set(existing.map((o) => o.id));
    const keepIds = new Set(cleaned.filter((o) => o.id).map((o) => o.id!));
    const toDelete = [...existingIds].filter((eid) => !keepIds.has(eid));
    const toUpdate = cleaned.filter((o) => o.id && existingIds.has(o.id));
    const toCreate = cleaned.filter((o) => !o.id);

    const updated = await prisma.$transaction(async (tx) => {
      if (toDelete.length) {
        await tx.pollOption.deleteMany({ where: { id: { in: toDelete } } });
      }
      for (const o of toUpdate) {
        await tx.pollOption.update({ where: { id: o.id! }, data: { text: o.text } });
      }
      if (toCreate.length) {
        await tx.pollOption.createMany({
          data: toCreate.map((o) => ({ pollId: id, text: o.text })),
        });
      }
      return tx.poll.update({
        where: { id },
        data,
        include: { options: { orderBy: { id: "asc" } } },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    await prisma.poll.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
