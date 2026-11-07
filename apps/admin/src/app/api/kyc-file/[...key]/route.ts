import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth, isAuthError } from "@/lib/api-utils";
import { getReporterId } from "@/lib/reporter-auth";
import { internalS3 } from "@/lib/blob";
import { KYC_BUCKET, parseKycKey } from "@/lib/kyc-storage";

// GET /api/kyc-file/kyc/<ownerUserId>/<name>
// Serves a private KYC document image (Aadhaar/PAN/ID card) from the private
// bucket. Only the owner, or ADMIN/EDITOR (KYC reviewers), may read it.
// Never cached anywhere.
const REVIEWER_ROLES = new Set(["ADMIN", "EDITOR"]);

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = (parts || []).join("/");
  const parsed = parseKycKey(key);
  if (!parsed) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });

  // Reporter app sends a Bearer token; the admin web UI uses the session cookie.
  let viewerId: string | null = null;
  let viewerRole: string | null = null;
  if ((req.headers.get("authorization") || "").startsWith("Bearer ")) {
    viewerId = await getReporterId(req);
  } else {
    const session = await requireAuth(["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER"]);
    if (!isAuthError(session)) {
      viewerId = session.user.id;
      viewerRole = session.user.role;
    }
  }
  if (!viewerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  if (viewerId !== parsed.ownerId && !(viewerRole && REVIEWER_ROLES.has(viewerRole))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  try {
    const obj = await internalS3().send(new GetObjectCommand({ Bucket: KYC_BUCKET, Key: key }));
    const body = obj.Body?.transformToWebStream();
    if (!body) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
    return new Response(body, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": obj.ContentType || "application/octet-stream",
        ...(obj.ContentLength != null ? { "Content-Length": String(obj.ContentLength) } : {}),
      },
    });
  } catch (e: any) {
    const status = e?.$metadata?.httpStatusCode === 404 || e?.name === "NoSuchKey" ? 404 : 500;
    return NextResponse.json({ error: status === 404 ? "Not found" : "Failed to load file" }, { status, headers: NO_STORE });
  }
}
