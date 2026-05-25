import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError, apiError } from "@/lib/api-utils";
import { buildEpubForEdition } from "@/lib/epaper/epub-builder";
import { uploadBuffer } from "@/lib/blob";

// POST /api/epaper/edition/[id]/epub
//
// Build a Kindle/Kobo-friendly ePub3 for the edition. Uploads to blob and
// returns the URL — caller (admin button or post-publish step) can persist
// on the edition row, link from /epaper, etc.
//
// Idempotent — re-running rebuilds + uploads a fresh blob.
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR"]);
  if (isAuthError(session)) return session;
  try {
    const { id } = await params;
    const { buffer, filename } = await buildEpubForEdition(id);
    const url = await uploadBuffer(buffer, "epub", "application/epub+zip");
    return NextResponse.json({ ok: true, url, filename, sizeBytes: buffer.byteLength });
  } catch (e) { return apiError(e); }
}
