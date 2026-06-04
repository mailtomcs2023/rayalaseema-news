/**
 * SharePoint mirror — Graph API client.
 *
 * Mirrors Azure-Blob-hosted media into the editorial SharePoint site at
 * repress.sharepoint.com/sites/rayalaseemaexpress so editors can browse the
 * media library in SP UI alongside other workflows.
 *
 * Auth: Sites.Selected app permission, scoped to this one site with WRITE
 * role (granted via `Grant-PnPAzureADAppSitePermission` equivalent). App
 * cannot touch other SP sites in the tenant.
 *
 * Target libraries:
 *   - Media-Library   (driveType: documentLibrary) for images
 *   - Video-Social                                  for videos
 *
 * Folder layout (mirrors existing 22-05-2026 manual setup):
 *   Media-Library/<District>/<YYYY>/<MM>/<file>            geo-tagged articles
 *   Media-Library/_Statewide/<YYYY>/<MM>/<file>            non-geo articles
 *   Media-Library/_Statewide/_Uploads/<YYYY>/<MM>/<file>   context-less uploads
 *   Video-Social/<Bucket>/<YYYY>/<MM>/<file>               videos / thumbs
 *
 * Mirroring is fire-and-forget by design — see mirrorToSharePoint(). If
 * Graph throws, the MediaMirror row stays at status="failed" with the
 * error; a reconciler can sweep for retries. Editor uploads never block
 * on SP latency.
 */

import { prisma } from "@rayalaseema/db";

const TENANT_ID = process.env.SP_TENANT_ID || "";
const CLIENT_ID = process.env.SP_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SP_CLIENT_SECRET || "";
const SITE_ID = process.env.SP_SITE_ID || "";
const MEDIA_DRIVE_ID = process.env.SP_MEDIA_DRIVE_ID || "";
const VIDEO_DRIVE_ID = process.env.SP_VIDEO_DRIVE_ID || "";

export function isSharePointConfigured(): boolean {
  return Boolean(
    TENANT_ID && CLIENT_ID && CLIENT_SECRET && SITE_ID && MEDIA_DRIVE_ID,
  );
}

// ─── token cache ─────────────────────────────────────────────────────
// App-only tokens last 60-90 min; we cache + refresh 5 min before expiry
// to avoid the round-trip on every upload while still surviving rotations
// without code restarts.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 5 * 60_000) {
    return cachedToken.value;
  }
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
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SP token endpoint ${res.status}: ${txt.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

// ─── low-level Graph wrappers ────────────────────────────────────────
async function graph<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAppToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof ArrayBuffer) && !(init.body instanceof Uint8Array)) {
    headers.set("Content-Type", "application/json");
  }
  const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Graph ${init.method || "GET"} ${path} → ${res.status}: ${txt.slice(0, 400)}`);
  }
  // Some endpoints return empty bodies (e.g. 204 on PUT chunks).
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ─── folder ensure (lazy create + cache) ─────────────────────────────
// Cache parent folder IDs per (driveId, path) so a year's worth of
// uploads doesn't replay the same "create Kurnool/2026/06" round-trips.
const folderIdCache = new Map<string, string>();

interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  folder?: { childCount: number };
  file?: { mimeType: string };
  parentReference?: { path: string };
}

/**
 * Ensure a folder exists at the given path inside a drive. Path segments
 * are slash-separated relative to the drive root (e.g. "Kurnool/2026/06").
 * Creates any missing intermediate folders. Returns the leaf folder's
 * driveItem id, cached for the lifetime of the process.
 */
async function ensureFolderPath(driveId: string, segments: string[]): Promise<string> {
  const cacheKey = `${driveId}::${segments.join("/")}`;
  const cached = folderIdCache.get(cacheKey);
  if (cached) return cached;

  // Walk segment-by-segment so each create-or-find call is independent.
  let parentId = "root";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const subPath = segments.slice(0, i + 1).join("/");
    const subKey = `${driveId}::${subPath}`;
    const subCached = folderIdCache.get(subKey);
    if (subCached) { parentId = subCached; continue; }

    // Try POST with conflictBehavior:fail; if it 409s, GET the existing
    // folder by path. "Rename" would silently create a duplicate.
    try {
      const created = await graph<DriveItem>(
        `/drives/${driveId}/items/${parentId}/children`,
        {
          method: "POST",
          body: JSON.stringify({
            name: seg,
            folder: {},
            "@microsoft.graph.conflictBehavior": "fail",
          }),
        },
      );
      parentId = created.id;
    } catch (e: any) {
      // 409 = folder already exists, fetch its id
      if (!String(e?.message || "").includes("409") && !String(e?.message || "").toLowerCase().includes("nameexists")) {
        throw e;
      }
      const existing = await graph<DriveItem>(
        `/drives/${driveId}/root:/${encodeURIComponent(subPath)}`,
      );
      parentId = existing.id;
    }
    folderIdCache.set(subKey, parentId);
  }
  return parentId;
}

// ─── path / filename derivation ──────────────────────────────────────
// District DB slug → SharePoint folder name. The folders were
// hand-created with PascalCase + literal hyphens; we mirror that here.
const DISTRICT_FOLDER: Record<string, string> = {
  kurnool: "Kurnool",
  nandyal: "Nandyal",
  ananthapuramu: "Ananthapuramu",
  "sri-sathya-sai": "Sri-Sathya-Sai",
  "ysr-kadapa": "YSR-Kadapa",
  annamayya: "Annamayya",
  tirupati: "Tirupati",
  chittoor: "Chittoor",
};

// Video roles route to Video-Social drive + dedicated buckets there.
const VIDEO_BUCKETS = {
  video: "Edited-Masters",
  thumb: "Thumbnails",
} as const;

export type MirrorRole = "cover" | "body" | "gallery" | "thumb" | "video";

export interface MirrorTargetContext {
  /** District slug from Content.constituency.district.slug. */
  districtSlug?: string | null;
  /** Article slug from Content.slug. */
  articleSlug?: string | null;
  /** Date the mirror is taking place (defaults to now). Used for the YYYY/MM bucket. */
  when?: Date;
}

interface ResolvedPath {
  driveId: string;
  /** Folder segments under the drive root, e.g. ["Kurnool", "2026", "06"]. */
  folderSegments: string[];
  /** Filename to use on SharePoint. */
  fileName: string;
  /** Public-friendly folder path for storage in MediaMirror.spFolderPath. */
  storedFolderPath: string;
}

/**
 * Decide where a blob should land in SP given its role + article context.
 * Filename pattern follows the spec:
 *   - role=cover   →  <slug>-cover.<ext>
 *   - role=body    →  <slug>-<NN>.<ext>           (NN zero-padded)
 *   - role=gallery →  <slug>-gallery-<NN>.<ext>
 *   - role=thumb   →  <slug>-thumb.<ext>
 *   - role=video   →  <slug>-video.<ext>
 *   - no article   →  _upload-<YYYYMMDD-HHmmss>-<id>.<ext>
 */
export function resolveMirrorTarget(
  role: MirrorRole,
  ext: string,
  ctx: MirrorTargetContext,
  roleIndex: number,
): ResolvedPath {
  const when = ctx.when || new Date();
  const yyyy = String(when.getFullYear());
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 6) || "bin";

  // Sanitize slug — SharePoint forbids: / \ * < > ? : | # %. Replace any
  // non-[a-z0-9-] with hyphen and collapse runs. Slug is already kebab-
  // case from the AI pipeline so this is mostly a no-op.
  const safeSlug = (ctx.articleSlug || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  // Pick drive based on role.
  const driveId = role === "video" || role === "thumb" ? VIDEO_DRIVE_ID : MEDIA_DRIVE_ID;

  // Folder segments.
  let bucket: string;
  if (driveId === VIDEO_DRIVE_ID) {
    bucket = VIDEO_BUCKETS[role as keyof typeof VIDEO_BUCKETS] || "Edited-Masters";
  } else {
    const distFolder = ctx.districtSlug ? DISTRICT_FOLDER[ctx.districtSlug] : null;
    bucket = distFolder || "_Statewide";
  }

  // No article context → land in _Uploads regardless of district.
  let folderSegments: string[];
  if (!safeSlug) {
    folderSegments = [
      driveId === VIDEO_DRIVE_ID ? bucket : "_Statewide",
      "_Uploads",
      yyyy,
      mm,
    ];
  } else {
    folderSegments = [bucket, yyyy, mm];
  }

  // Filename
  let fileName: string;
  if (!safeSlug) {
    const ts = `${yyyy}${mm}${String(when.getDate()).padStart(2, "0")}-${String(when.getHours()).padStart(2, "0")}${String(when.getMinutes()).padStart(2, "0")}${String(when.getSeconds()).padStart(2, "0")}`;
    const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
    fileName = `_upload-${ts}-${rand}.${safeExt}`;
  } else if (role === "cover" || role === "thumb" || role === "video") {
    fileName = `${safeSlug}-${role}.${safeExt}`;
  } else if (role === "gallery") {
    fileName = `${safeSlug}-gallery-${String(roleIndex).padStart(2, "0")}.${safeExt}`;
  } else {
    fileName = `${safeSlug}-${String(roleIndex).padStart(2, "0")}.${safeExt}`;
  }

  return { driveId, folderSegments, fileName, storedFolderPath: folderSegments.join("/") };
}

// ─── upload primitives ───────────────────────────────────────────────
// SMALL: <4 MiB → single PUT to /items/{parent}:/<name>:/content. Most
// editorial photos fall here so we keep the hot path one-call.
// Convert a Uint8Array view into a standalone ArrayBuffer so fetch
// BodyInit accepts it under both Bun and node typings.
function toArrayBuffer(buf: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

async function uploadSmall(
  driveId: string,
  parentId: string,
  fileName: string,
  buf: Uint8Array,
  mimeType: string,
): Promise<DriveItem> {
  const safeName = encodeURIComponent(fileName);
  return graph<DriveItem>(
    `/drives/${driveId}/items/${parentId}:/${safeName}:/content?@microsoft.graph.conflictBehavior=rename`,
    {
      method: "PUT",
      headers: { "Content-Type": mimeType || "application/octet-stream" },
      body: toArrayBuffer(buf),
    },
  );
}

// LARGE: ≥4 MiB → createUploadSession then chunked PUT in 10 MiB slices.
// Slice size must be a multiple of 320 KiB per the Graph spec; 10 MiB
// works out to 32 × 320 KiB and is the recommended sweet spot for stable
// connections (slow networks should drop to 5 MiB).
const SMALL_THRESHOLD = 4 * 1024 * 1024;
const CHUNK_SIZE = 10 * 1024 * 1024;

async function uploadLarge(
  driveId: string,
  parentId: string,
  fileName: string,
  buf: Uint8Array,
  mimeType: string,
): Promise<DriveItem> {
  const safeName = encodeURIComponent(fileName);
  // Step 1 — create the session.
  const session = await graph<{ uploadUrl: string; expirationDateTime: string }>(
    `/drives/${driveId}/items/${parentId}:/${safeName}:/createUploadSession`,
    {
      method: "POST",
      body: JSON.stringify({
        item: {
          "@microsoft.graph.conflictBehavior": "rename",
          name: fileName,
        },
      }),
    },
  );
  // Step 2 — PUT chunks sequentially against session.uploadUrl. No
  // Authorization header on these PUTs (Graph spec rejects them).
  const total = buf.byteLength;
  let final: DriveItem | null = null;
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, total) - 1;
    const slice = buf.subarray(start, end + 1);
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(slice.byteLength),
        "Content-Range": `bytes ${start}-${end}/${total}`,
      },
      body: toArrayBuffer(slice),
    });
    if (end + 1 === total) {
      // Last chunk → server returns 200/201 with the final DriveItem.
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`SP upload final chunk ${res.status}: ${txt.slice(0, 300)}`);
      }
      final = (await res.json()) as DriveItem;
    } else {
      if (res.status !== 202) {
        const txt = await res.text();
        throw new Error(`SP upload chunk ${res.status}: ${txt.slice(0, 300)}`);
      }
    }
  }
  if (!final) throw new Error("SP upload session completed without a final DriveItem");
  return final;
}

// ─── mirror entrypoint ───────────────────────────────────────────────
/**
 * Mirror a Blob URL into SharePoint. Resolves the target folder + file
 * name, downloads the blob, uploads via small or chunked session, and
 * updates the MediaMirror row.
 *
 * Fire-and-forget pattern: the caller awaits queueMirror() which only
 * persists the pending MediaMirror row, then kicks the actual upload via
 * runMirrorRow() inside `void (async () => …)()`. Editor responses
 * return immediately; failures end up on the MediaMirror row for cron
 * reconciliation.
 */
export interface QueueMirrorArgs {
  blobUrl: string;
  contentId?: string | null;
  role: MirrorRole;
  mimeType: string;
  sizeBytes: number;
}

export async function queueMirror(args: QueueMirrorArgs): Promise<{ id: string } | null> {
  if (!isSharePointConfigured()) return null;

  // Skip if already mirrored (or in-flight).
  const existing = await prisma.mediaMirror.findUnique({ where: { blobUrl: args.blobUrl } });
  if (existing) return { id: existing.id };

  // Count existing rows for this (contentId, role) to derive the index.
  let roleIndex = 1;
  if (args.contentId) {
    const count = await prisma.mediaMirror.count({
      where: { contentId: args.contentId, role: args.role },
    });
    roleIndex = count + 1;
  }

  const row = await prisma.mediaMirror.create({
    data: {
      blobUrl: args.blobUrl,
      contentId: args.contentId || null,
      role: args.role,
      roleIndex,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      status: "pending",
    },
  });

  // Background — never await from request paths.
  void runMirrorRow(row.id).catch((e) => {
    console.error("[sp-mirror] background run failed:", row.id, e);
  });

  return { id: row.id };
}

/**
 * Execute the mirror for a queued row. Idempotent: if the row is already
 * "done", returns silently. If "uploading", refuses to start a parallel
 * one. Call this from queueMirror() OR from a reconciler cron over
 * status="pending" / "failed" rows.
 */
export async function runMirrorRow(rowId: string): Promise<void> {
  if (!isSharePointConfigured()) return;
  const row = await prisma.mediaMirror.findUnique({
    where: { id: rowId },
    include: {
      content: {
        select: {
          slug: true,
          constituency: { select: { district: { select: { slug: true } } } },
        },
      },
    },
  });
  if (!row) return;
  if (row.status === "done") return;

  // Acquire — bump attempts, flip to uploading. If another worker beat us
  // to it (status already "uploading"), bail.
  const acquired = await prisma.mediaMirror.updateMany({
    where: { id: rowId, status: { in: ["pending", "failed"] } },
    data: { status: "uploading", attempts: { increment: 1 } },
  });
  if (acquired.count === 0) return;

  try {
    // Derive target path.
    const ext = filenameExt(row.blobUrl);
    const target = resolveMirrorTarget(
      row.role as MirrorRole,
      ext,
      {
        articleSlug: row.content?.slug || null,
        districtSlug: row.content?.constituency?.district?.slug || null,
      },
      row.roleIndex,
    );

    // Download blob.
    const blobRes = await fetch(row.blobUrl);
    if (!blobRes.ok) {
      throw new Error(`Blob fetch ${blobRes.status} for ${row.blobUrl}`);
    }
    const buf = new Uint8Array(await blobRes.arrayBuffer());

    // Ensure parent folder + upload.
    const parentId = await ensureFolderPath(target.driveId, target.folderSegments);
    const item =
      buf.byteLength < SMALL_THRESHOLD
        ? await uploadSmall(target.driveId, parentId, target.fileName, buf, row.mimeType)
        : await uploadLarge(target.driveId, parentId, target.fileName, buf, row.mimeType);

    await prisma.mediaMirror.update({
      where: { id: row.id },
      data: {
        status: "done",
        mirroredAt: new Date(),
        spDriveId: target.driveId,
        spItemId: item.id,
        spWebUrl: item.webUrl,
        spFolderPath: target.storedFolderPath,
        spFileName: target.fileName,
        lastError: null,
      },
    });
  } catch (e: any) {
    await prisma.mediaMirror.update({
      where: { id: row.id },
      data: {
        status: "failed",
        lastError: String(e?.message || e).slice(0, 500),
      },
    });
    throw e;
  }
}

function filenameExt(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").pop() || "";
    const dot = last.lastIndexOf(".");
    return dot >= 0 ? last.slice(dot + 1) : "";
  } catch {
    return "";
  }
}

// ─── browse API (picker) ─────────────────────────────────────────────
// The picker UI hits these. Sites.Selected can't use Graph search across
// the drive, so we expose folder-children + DB-backed filename search.

export interface PickerItem {
  blobUrl: string;
  spWebUrl: string | null;
  spFolderPath: string | null;
  spFileName: string | null;
  role: string;
  roleIndex: number;
  mimeType: string;
  contentId: string | null;
  contentSlug?: string | null;
  createdAt: Date;
}

export async function listMirroredMedia(opts: {
  district?: string | null; // PascalCase folder name or "_Statewide"
  yyyy?: string;
  mm?: string;
  q?: string; // filename / slug substring
  limit?: number;
  cursor?: string; // MediaMirror.id
}): Promise<{ items: PickerItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit || 48, 1), 200);
  const where: Record<string, unknown> = { status: "done" };
  if (opts.district || opts.yyyy || opts.mm) {
    const segs = [opts.district, opts.yyyy, opts.mm].filter(Boolean).join("/");
    where.spFolderPath = { startsWith: segs };
  }
  if (opts.q) {
    where.spFileName = { contains: opts.q, mode: "insensitive" };
  }
  const rows = await prisma.mediaMirror.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { content: { select: { slug: true } } },
  });
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: slice.map((r) => ({
      blobUrl: r.blobUrl,
      spWebUrl: r.spWebUrl,
      spFolderPath: r.spFolderPath,
      spFileName: r.spFileName,
      role: r.role,
      roleIndex: r.roleIndex,
      mimeType: r.mimeType,
      contentId: r.contentId,
      contentSlug: r.content?.slug ?? null,
      createdAt: r.createdAt,
    })),
    nextCursor: hasMore ? slice[slice.length - 1].id : null,
  };
}
