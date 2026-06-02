import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@rayalaseema/db";
import { rateLimit } from "@/lib/rate-limit";

// Fingerprint = sha256(ip + ua). Same NAT means same key, which matches the
// "one vote per device on this Wi-Fi" feel of WhatsApp polls. We never store
// the raw IP/UA, only the hash.
function voterKeyFor(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex");
}

type PollWithOptions = {
  id: string;
  question: string;
  allowMultiple: boolean;
  expiresAt: Date | null;
  options: { id: string; text: string; votes: number }[];
};

function serialise(poll: PollWithOptions, votedOptionIds: Set<string>) {
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes, 0);
  return {
    id: poll.id,
    question: poll.question,
    allowMultiple: poll.allowMultiple,
    expiresAt: poll.expiresAt ? poll.expiresAt.toISOString() : null,
    totalVotes,
    voted: poll.options.some((o) => votedOptionIds.has(o.id)),
    options: poll.options.map((o) => ({
      id: o.id,
      text: o.text,
      votes: o.votes,
      percentage: totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0,
      youVoted: votedOptionIds.has(o.id),
    })),
  };
}

// GET: every active, non-expired poll, with "voted" markers for this device
// so the widget can render results directly for polls the visitor already
// answered.
export async function GET(req: NextRequest) {
  try {
    const polls = await prisma.poll.findMany({
      where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      include: { options: { orderBy: { id: "asc" } } },
      orderBy: { createdAt: "desc" },
    });

    if (polls.length === 0) return NextResponse.json([]);

    const voterKey = voterKeyFor(req);
    const myVotes = await prisma.pollVote.findMany({
      where: { voterKey, pollId: { in: polls.map((p) => p.id) } },
      select: { pollId: true, optionId: true },
    });
    const votedByPoll = new Map<string, Set<string>>();
    for (const v of myVotes) {
      const set = votedByPoll.get(v.pollId) ?? new Set<string>();
      set.add(v.optionId);
      votedByPoll.set(v.pollId, set);
    }

    return NextResponse.json(polls.map((p) => serialise(p, votedByPoll.get(p.id) ?? new Set())));
  } catch (e) {
    console.error("[polls] GET error:", e);
    return NextResponse.json([]);
  }
}

// POST: cast a vote. Body:
//   { pollId, optionIds: string[] }  - new shape, multi-aware
//   { optionId }                     - legacy shape (single option, no poll id)
// Rejects with 409 if this voterKey already voted on the poll.
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { maxRequests: 5, windowMs: 60_000, prefix: "poll-vote" });
  if (limited) return limited;

  try {
    const body = await req.json();
    let pollId: string | undefined = body.pollId;
    let optionIds: string[] = Array.isArray(body.optionIds)
      ? body.optionIds.filter((x: unknown): x is string => typeof x === "string")
      : typeof body.optionId === "string"
      ? [body.optionId]
      : [];

    if (optionIds.length === 0) {
      return NextResponse.json({ error: "Option required" }, { status: 400 });
    }

    // Resolve pollId from optionId for the legacy single-option clients.
    if (!pollId) {
      const opt = await prisma.pollOption.findUnique({ where: { id: optionIds[0] } });
      if (!opt) return NextResponse.json({ error: "Unknown option" }, { status: 404 });
      pollId = opt.pollId;
    }

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: { select: { id: true } } },
    });
    if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });
    if (!poll.active) return NextResponse.json({ error: "Poll is closed" }, { status: 410 });
    if (poll.expiresAt && poll.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Poll has expired" }, { status: 410 });
    }

    const validIds = new Set(poll.options.map((o) => o.id));
    optionIds = [...new Set(optionIds)].filter((id) => validIds.has(id));
    if (optionIds.length === 0) {
      return NextResponse.json({ error: "Selected options do not belong to this poll" }, { status: 400 });
    }
    if (!poll.allowMultiple && optionIds.length > 1) {
      return NextResponse.json({ error: "This poll only allows one answer" }, { status: 400 });
    }

    const voterKey = voterKeyFor(req);

    // Already voted? Single check covers both single- and multi-choice -
    // we treat each device as having one submission per poll.
    const existing = await prisma.pollVote.findFirst({ where: { pollId, voterKey } });
    if (existing) {
      return NextResponse.json({ error: "Already voted" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.pollVote.createMany({
        data: optionIds.map((optionId) => ({ pollId: pollId!, optionId, voterKey })),
      });
      for (const optionId of optionIds) {
        await tx.pollOption.update({ where: { id: optionId }, data: { votes: { increment: 1 } } });
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[polls] POST error:", e);
    return NextResponse.json({ error: "Vote failed" }, { status: 500 });
  }
}
