/**
 * scripts/sp-backfill.ts
 *
 * Walks every PUBLISHED + DRAFT Content row that has a featured image
 * stored on Azure Blob and back-fills the SharePoint mirror so the
 * picker shows historical media too. Idempotent — rows already
 * present in MediaMirror are skipped.
 *
 * Runs serially with a small inter-upload delay so Graph throttling
 * stays below the 25 req/s/app cap. ~3-4 mirrors/s in practice.
 *
 * Usage:
 *   bun run apps/admin/src/scripts/sp-backfill.ts                # all rows
 *   bun run apps/admin/src/scripts/sp-backfill.ts --limit=200    # cap
 *   bun run apps/admin/src/scripts/sp-backfill.ts --dry-run      # plan only
 */

import { prisma } from "@rayalaseema/db";
import { isSharePointConfigured, runMirrorRow, type MirrorRole } from "../lib/sharepoint";

interface Options {
  limit: number;
  dryRun: boolean;
  delayMs: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  let limit = Infinity;
  let dryRun = false;
  let delayMs = 250;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--limit=")) limit = Math.max(1, parseInt(a.slice(8), 10) || 0);
    else if (a.startsWith("--delay=")) delayMs = Math.max(0, parseInt(a.slice(8), 10) || 0);
  }
  return { limit, dryRun, delayMs };
}

async function main() {
  const opts = parseArgs();

  if (!isSharePointConfigured()) {
    console.error("SharePoint env not configured (SP_* missing). Aborting.");
    process.exit(1);
  }

  console.log(`Mode: ${opts.dryRun ? "DRY-RUN" : "MIRROR"}  |  limit: ${opts.limit === Infinity ? "all" : opts.limit}  |  delay: ${opts.delayMs}ms`);

  // Pull Content rows that have a hosted image. We're after blob URLs;
  // external publisher URLs that slipped through (no rehost) are
  // skipped here — the regular auto-fetch path rehosts them later.
  const rows = await prisma.content.findMany({
    where: {
      featuredImage: { not: null },
    },
    select: {
      id: true,
      slug: true,
      featuredImage: true,
      type: true,
      payload: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${rows.length} content rows with featuredImage.`);

  let queued = 0;
  let skipped = 0;
  let mirrored = 0;
  let failed = 0;

  for (const row of rows) {
    if (queued >= opts.limit) break;
    const url = row.featuredImage;
    if (!url || !isBlobUrl(url)) { skipped++; continue; }

    // Featured image -> cover. Future passes can iterate
    // payload.photos[] for PHOTO_GALLERY rows.
    const role: MirrorRole = "cover";

    const existing = await prisma.mediaMirror.findUnique({ where: { blobUrl: url } });
    if (existing && existing.status === "done") { skipped++; continue; }

    queued++;
    if (opts.dryRun) {
      console.log(`[dry] ${row.slug?.slice(0, 60).padEnd(60)} -> ${url.slice(-40)}`);
      continue;
    }

    let mirrorRow = existing;
    if (!mirrorRow) {
      mirrorRow = await prisma.mediaMirror.create({
        data: {
          blobUrl: url,
          contentId: row.id,
          role,
          roleIndex: 1,
          mimeType: guessMime(url),
          sizeBytes: 0,
          status: "pending",
        },
      });
    } else if (mirrorRow.status === "failed") {
      // Reset failed rows so runMirrorRow can re-attempt.
      await prisma.mediaMirror.update({
        where: { id: mirrorRow.id },
        data: { status: "pending", lastError: null },
      });
    }

    try {
      await runMirrorRow(mirrorRow.id);
      mirrored++;
      if (mirrored % 25 === 0) console.log(`  …${mirrored} mirrored`);
    } catch (e: any) {
      failed++;
      console.warn(`  FAIL ${row.slug?.slice(0, 60)}: ${e?.message || e}`);
    }

    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
  }

  // PHOTO_GALLERY payload.photos[] - each photo is a separate file.
  if (!opts.dryRun) {
    const galleries = await prisma.content.findMany({
      where: { type: "PHOTO_GALLERY" },
      select: { id: true, slug: true, payload: true },
    });
    let galleryMirrored = 0;
    for (const g of galleries) {
      const photos = readPhotos(g.payload);
      let i = 0;
      for (const p of photos) {
        i++;
        if (!p || !isBlobUrl(p)) continue;
        const exist = await prisma.mediaMirror.findUnique({ where: { blobUrl: p } });
        if (exist && exist.status === "done") continue;
        const row = exist || (await prisma.mediaMirror.create({
          data: {
            blobUrl: p,
            contentId: g.id,
            role: "gallery",
            roleIndex: i,
            mimeType: guessMime(p),
            sizeBytes: 0,
            status: "pending",
          },
        }));
        try {
          await runMirrorRow(row.id);
          galleryMirrored++;
        } catch (e: any) {
          console.warn(`  GALLERY FAIL ${g.slug}/photo-${i}: ${e?.message || e}`);
        }
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      }
    }
    console.log(`Gallery photos mirrored: ${galleryMirrored}`);
  }

  console.log("\n=== summary ===");
  console.log(`queued:   ${queued}`);
  console.log(`skipped:  ${skipped} (non-blob OR already done)`);
  console.log(`mirrored: ${mirrored}`);
  console.log(`failed:   ${failed}`);
}

function isBlobUrl(url: string): boolean {
  return url.includes("rayalaseemamedia.blob.core.windows.net");
}

function guessMime(url: string): string {
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0] || "";
  return ({
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  } as Record<string, string>)[ext] || "application/octet-stream";
}

function readPhotos(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as { photos?: unknown };
  if (!Array.isArray(p.photos)) return [];
  return p.photos
    .map((x) => (x && typeof x === "object" && "url" in x ? String((x as { url: unknown }).url) : null))
    .filter((x): x is string => !!x);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
