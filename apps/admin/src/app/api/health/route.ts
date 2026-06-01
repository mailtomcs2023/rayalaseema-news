// GET /api/health - liveness + dependency check.
//
// Returns 200 + JSON when all probed dependencies are reachable, 503 when
// any one fails. Designed for external uptime monitors (Better Stack /
// Pingdom / UptimeRobot) so they can alert on a single endpoint instead of
// trying to detect outages from feature pages.
//
// Probes:
//   - db        - `SELECT 1` round-trip through Prisma.
//   - ai        - Azure OpenAI env vars present (we don't fetch - that
//                 would burn credits on every health poll).
//
// NOT cached. Returns no PII; safe to expose publicly.
import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";

interface ProbeResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

async function probeDb(): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    // $queryRaw with a no-op SELECT - cheapest possible round-trip that
    // proves the pool is alive AND the DB is reachable.
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - t0, error: e?.message?.slice(0, 200) || "DB unreachable" };
  }
}

function probeAi(): ProbeResult {
  // Don't actually call OpenAI - health check shouldn't cost money. Just
  // confirm the env wiring exists so a misconfigured deploy fails loudly.
  if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_KEY) {
    return { ok: false, error: "AZURE_OPENAI env not configured" };
  }
  return { ok: true };
}

export async function GET() {
  const [db, ai] = [await probeDb(), probeAi()];
  const allOk = db.ok && ai.ok;
  const body = {
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
    deps: { db, ai },
  };
  return NextResponse.json(body, {
    status: allOk ? 200 : 503,
    headers: {
      // Health checks should never be cached - a stale "ok" is worse than no answer.
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
