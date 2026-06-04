/**
 * GET /api/media/sp-picker
 *
 * Lists media mirrored to SharePoint for the editor's image picker.
 * Query params:
 *   - district  PascalCase folder (Kurnool, _Statewide, ...) - optional
 *   - yyyy      year segment (e.g. 2026)                    - optional
 *   - mm        month segment (e.g. 06)                     - optional
 *   - q         filename substring                          - optional
 *   - cursor    MediaMirror.id for pagination               - optional
 *
 * Returns rows that hit MediaMirror.status="done". Picker uses the
 * blob URL for previews + insertion (already on CDN), and spWebUrl to
 * open the item in SharePoint UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { listMirroredMedia } from "@/lib/sharepoint";

export async function GET(req: NextRequest) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
  if (isAuthError(session)) return session;

  const { searchParams } = new URL(req.url);
  const district = searchParams.get("district") || null;
  const yyyy = searchParams.get("yyyy") || undefined;
  const mm = searchParams.get("mm") || undefined;
  const q = searchParams.get("q") || undefined;
  const cursor = searchParams.get("cursor") || undefined;
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "48", 10), 1), 200);
  // Editor-side picker keeps default (status="done" only) so it never
  // hands the editor a synthetic sp-only:// URL. /media-library page
  // passes ?includeExternal=true so it shows manual-SP-upload items too.
  const includeExternal = searchParams.get("includeExternal") === "true";

  try {
    const result = await listMirroredMedia({ district, yyyy, mm, q, cursor, limit, includeExternal });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "picker query failed" }, { status: 500 });
  }
}
