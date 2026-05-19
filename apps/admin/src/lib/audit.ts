import { NextRequest } from "next/server";
import { prisma } from "@rayalaseema/db";

type Actor = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
};

interface LogAuditArgs {
  action: string;        // e.g. "article.update", "user.role.change"
  resource?: string;     // e.g. "article", "user"
  resourceId?: string;
  meta?: Record<string, unknown>;
  actor?: Actor;         // pass from session.user — null/empty for system actions
  req?: NextRequest;     // optional, used to extract IP + user-agent
}

// Fire-and-forget audit logger. Never throws — audit failures must not block real work.
// Captures IP from common proxy headers (x-forwarded-for, x-real-ip) when req is passed.
export async function logAudit(args: LogAuditArgs): Promise<void> {
  try {
    const ip = args.req
      ? (args.req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
         args.req.headers.get("x-real-ip") ||
         null)
      : null;
    const userAgent = args.req?.headers.get("user-agent") || null;

    await prisma.auditLog.create({
      data: {
        actorId: args.actor?.id || null,
        actorEmail: args.actor?.email || null,
        actorRole: args.actor?.role || null,
        action: args.action,
        resource: args.resource || null,
        resourceId: args.resourceId || null,
        meta: (args.meta ?? null) as any,
        ipAddress: ip,
        userAgent,
      },
    });
  } catch (err) {
    // Best-effort: do not break the originating request if audit insert fails
    console.error("[audit] failed to record log:", err);
  }
}

// Compute a lightweight diff summary of changed fields for the audit `meta` payload.
// Avoid logging full body text — only field names and short before/after values.
export function diffSummary(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  if (!before) return out;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (a === b) continue;
    if (a === undefined && b === undefined) continue;
    // Truncate long string values for log payload safety
    const trunc = (v: unknown) => typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v;
    out[k] = { from: trunc(a), to: trunc(b) };
  }
  return out;
}
