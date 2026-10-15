import { prisma } from "@rayalaseema/db";
import { auth } from "@/lib/auth";
import { getReporterId } from "@/lib/reporter-auth";

// Resolves "whose card is this" for self-service endpoints (the mine/pdf
// routes), for ANY staff role - not just REPORTER. getReporterId() already
// covers the REPORTER-specific paths (Expo bearer token, or a REPORTER
// NextAuth session); when that comes back null we fall back to a plain
// NextAuth session for any other role (ADMIN/EDITOR/SUB_EDITOR), since
// press cards are now self-service for all staff, not reporters only.
// Returns the user id only when the account is still active, same as
// getReporterId's own check.
export async function resolveHolderId(req: Request): Promise<string | null> {
  const reporterId = await getReporterId(req);
  if (reporterId) return reporterId;

  const session = await auth();
  const uid = (session?.user as any)?.id as string | undefined;
  if (!uid) return null;
  const user = await prisma.user.findUnique({ where: { id: uid }, select: { active: true } });
  if (!user || !user.active) return null;
  return uid;
}
