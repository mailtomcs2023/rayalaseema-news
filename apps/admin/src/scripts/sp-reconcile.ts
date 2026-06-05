/**
 * scripts/sp-reconcile.ts
 *
 * Walks the SharePoint Media-Library + Video-Social drives and
 * back-fills MediaMirror rows for files the editor uploaded manually
 * via the SP UI (drag-and-drop into a folder, copy-paste from Outlook,
 * etc). Those won't have a blob URL - they exist only on SP - so we
 * synthesize a `sp-only://<spItemId>` placeholder blobUrl and set
 * status="external". The /api/media/sp-picker route returns these
 * when called with ?includeExternal=true so the media-library page
 * can surface them; the editor-side picker keeps the filter to
 * status="done" (real mirrors of blob uploads) so editors don't
 * accidentally insert a non-CDN URL into an article.
 *
 * Usage:
 *   bun run apps/admin/src/scripts/sp-reconcile.ts           # full sweep
 *   bun run apps/admin/src/scripts/sp-reconcile.ts --media   # Media-Library only
 *   bun run apps/admin/src/scripts/sp-reconcile.ts --video   # Video-Social only
 *   bun run apps/admin/src/scripts/sp-reconcile.ts --dry-run
 *
 * Run from a cron every 10-15 min (when wired up).
 */

import { prisma } from "@rayalaseema/db";

const TENANT_ID = process.env.SP_TENANT_ID || "";
const CLIENT_ID = process.env.SP_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SP_CLIENT_SECRET || "";
const MEDIA_DRIVE_ID = process.env.SP_MEDIA_DRIVE_ID || "";
const VIDEO_DRIVE_ID = process.env.SP_VIDEO_DRIVE_ID || "";

interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { path?: string };
  lastModifiedDateTime?: string;
}

interface Options {
  drives: Array<"media" | "video">;
  dryRun: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  let media = false;
  let video = false;
  let dryRun = false;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--media") media = true;
    else if (a === "--video") video = true;
  }
  if (!media && !video) { media = true; video = true; }
  return { drives: [media && "media", video && "video"].filter(Boolean) as Array<"media" | "video">, dryRun };
}

let cachedToken: { value: string; expiresAt: number } | null = null;
async function token(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 5 * 60_000) return cachedToken.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}

async function graphGet<T>(path: string): Promise<T> {
  const t = await token();
  const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`Graph GET ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Recursively enumerate every file under a drive item. */
async function* walkChildren(driveId: string, itemId: string, pathSoFar: string[]): AsyncGenerator<{ item: DriveItem; folderPath: string }> {
  interface Page { value: DriveItem[]; "@odata.nextLink"?: string }
  let next: string | null = `/drives/${driveId}/items/${itemId}/children?$top=200`;
  while (next) {
    const page: Page = await graphGet<Page>(next);
    for (const item of page.value) {
      if (item.folder) {
        // Recurse into subfolders.
        yield* walkChildren(driveId, item.id, [...pathSoFar, item.name]);
      } else if (item.file) {
        yield { item, folderPath: pathSoFar.join("/") };
      }
    }
    next = page["@odata.nextLink"] || null;
  }
}

async function reconcileDrive(driveId: string, driveLabel: string, dryRun: boolean): Promise<{ scanned: number; created: number; updated: number; skipped: number }> {
  console.log(`\n=== Reconciling drive: ${driveLabel} (${driveId.slice(0, 24)}…) ===`);
  let scanned = 0, created = 0, updated = 0, skipped = 0;

  // Existing rows for this drive, keyed by spItemId for fast lookup.
  const known = new Map<string, { id: string; spFileName: string | null; spFolderPath: string | null }>();
  const existing = await prisma.mediaMirror.findMany({
    where: { spDriveId: driveId },
    select: { id: true, spItemId: true, spFileName: true, spFolderPath: true },
  });
  for (const r of existing) if (r.spItemId) known.set(r.spItemId, { id: r.id, spFileName: r.spFileName, spFolderPath: r.spFolderPath });

  for await (const { item, folderPath } of walkChildren(driveId, "root", [])) {
    scanned++;
    const k = known.get(item.id);
    if (k) {
      // Update name / folderPath if they drifted (rare).
      if (k.spFileName !== item.name || k.spFolderPath !== folderPath) {
        if (!dryRun) {
          await prisma.mediaMirror.update({
            where: { id: k.id },
            data: { spFileName: item.name, spFolderPath: folderPath },
          });
        }
        updated++;
      } else {
        skipped++;
      }
      continue;
    }
    // New item not seen before - treat as manual SP upload.
    const synthBlob = `sp-only://${item.id}`;
    if (dryRun) {
      console.log(`[dry] CREATE  ${folderPath}/${item.name}  (${item.file?.mimeType || "?"})`);
      created++;
      continue;
    }
    try {
      await prisma.mediaMirror.create({
        data: {
          blobUrl: synthBlob,
          contentId: null,
          role: driveLabel === "Video-Social" ? "video" : "body",
          roleIndex: 1,
          mimeType: item.file?.mimeType || "application/octet-stream",
          sizeBytes: item.size || 0,
          status: "external",
          spDriveId: driveId,
          spItemId: item.id,
          spWebUrl: item.webUrl,
          spFolderPath: folderPath,
          spFileName: item.name,
          mirroredAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : new Date(),
        },
      });
      created++;
    } catch (e: any) {
      // Unique-constraint clashes if we reconcile twice in quick
      // succession - safe to skip silently.
      if (!String(e?.message || "").includes("Unique constraint")) {
        console.warn(`  ingest failed for ${folderPath}/${item.name}: ${e?.message || e}`);
      }
    }
  }

  console.log(`Scanned ${scanned} files. Created ${created}, Updated ${updated}, Skipped ${skipped}.`);
  return { scanned, created, updated, skipped };
}

async function main() {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    console.error("SP_* env not configured. Aborting.");
    process.exit(1);
  }
  const opts = parseArgs();
  console.log(`Mode: ${opts.dryRun ? "DRY-RUN" : "WRITE"}  |  drives: ${opts.drives.join(", ")}`);

  if (opts.drives.includes("media") && MEDIA_DRIVE_ID) {
    await reconcileDrive(MEDIA_DRIVE_ID, "Media-Library", opts.dryRun);
  }
  if (opts.drives.includes("video") && VIDEO_DRIVE_ID) {
    await reconcileDrive(VIDEO_DRIVE_ID, "Video-Social", opts.dryRun);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
