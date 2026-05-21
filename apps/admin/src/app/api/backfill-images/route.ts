import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { uploadImageFromUrl, blobConfigured } from "@/lib/blob";

/**
 * Re-host existing articles' external (hotlink-blocked) images on Azure Blob.
 * Batched — call repeatedly with ?limit=N until done:0.
 * POST /api/backfill-images?limit=20
 */
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;

  if (!blobConfigured()) {
    return NextResponse.json({ error: "AZURE_STORAGE_CONNECTION_STRING not configured" }, { status: 503 });
  }

  const limit = Math.min(parseInt(new URL(req.url).searchParams.get("limit") || "20"), 40);

  // Articles whose image is still an external URL (not yet on our blob)
  const pending = await prisma.article.findMany({
    where: {
      featuredImage: { not: null },
      NOT: { featuredImage: { contains: ".blob.core.windows.net/" } },
    },
    select: { id: true, featuredImage: true },
    take: limit,
  });

  let rehosted = 0;
  let failed = 0;
  for (const a of pending) {
    const hosted = await uploadImageFromUrl(a.featuredImage);
    if (hosted) {
      await prisma.article.update({ where: { id: a.id }, data: { featuredImage: hosted } });
      rehosted++;
    } else {
      // Source unreachable (403/expired) — null it so the UI shows a clean placeholder
      await prisma.article.update({ where: { id: a.id }, data: { featuredImage: null } });
      failed++;
    }
  }

  const remaining = await prisma.article.count({
    where: {
      featuredImage: { not: null },
      NOT: { featuredImage: { contains: ".blob.core.windows.net/" } },
    },
  });

  try {
    return NextResponse.json({ processed: pending.length, rehosted, failed, remaining });
  } catch (error) {
    return apiError(error);
  }
}
