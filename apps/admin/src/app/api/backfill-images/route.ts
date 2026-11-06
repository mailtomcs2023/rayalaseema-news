import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { uploadImageFromUrl, blobConfigured } from "@/lib/blob";

/**
 * Re-host existing articles' external (hotlink-blocked) images on Azure Blob.
 * Batched - call repeatedly with ?limit=N until done:0.
 * POST /api/backfill-images?limit=20
 */
export async function POST(req: NextRequest) {
  const session = await requireAuth(["ADMIN"]);
  if (isAuthError(session)) return session;

  if (!blobConfigured()) {
    return NextResponse.json({ error: "Media storage (MEDIA_S3_*) not configured" }, { status: 503 });
  }

  const limit = Math.min(parseInt(new URL(req.url).searchParams.get("limit") || "20"), 40);

  // Rows already on our media store (new MinIO base) or the legacy Azure Blob host.
  const mediaBase = (process.env.MEDIA_PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  const ownMedia = [
    { featuredImage: { contains: ".blob.core.windows.net/" } },
    ...(mediaBase ? [{ featuredImage: { startsWith: mediaBase + "/" } }] : []),
  ];

  // Articles whose image is still an external URL (not yet on our media store)
  const pending = await prisma.content.findMany({
    where: {
      type: "ARTICLE",
      featuredImage: { not: null },
      NOT: { OR: ownMedia },
    },
    select: { id: true, featuredImage: true },
    take: limit,
  });

  let rehosted = 0;
  let failed = 0;
  for (const a of pending) {
    const hosted = await uploadImageFromUrl(a.featuredImage);
    if (hosted) {
      await prisma.content.update({ where: { id: a.id }, data: { featuredImage: hosted } });
      rehosted++;
    } else {
      // Source unreachable (403/expired) - null it so the UI shows a clean placeholder
      await prisma.content.update({ where: { id: a.id }, data: { featuredImage: null } });
      failed++;
    }
  }

  const remaining = await prisma.content.count({
    where: {
      type: "ARTICLE",
      featuredImage: { not: null },
      NOT: { OR: ownMedia },
    },
  });

  try {
    return NextResponse.json({ processed: pending.length, rehosted, failed, remaining });
  } catch (error) {
    return apiError(error);
  }
}
