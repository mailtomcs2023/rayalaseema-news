import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { internalS3, MEDIA_BUCKET, MEDIA_PUBLIC_BASE } from "./blob";

// KYC document images (Aadhaar/PAN/ID card) must never be publicly readable.
//
// Uploads still land in the public media bucket first (shared upload
// widgets + the reporter app use the generic upload endpoints). Every route
// that SAVES a KYC field passes the value through secureKycFields(), which
// moves the object into the private bucket and stores an app-relative path:
//
//   /api/kyc-file/kyc/<ownerUserId>/<name>
//
// That route serves the file only to the owner or to ADMIN/EDITOR, so the
// stored value works as an <img src> in the admin UI without any read-time
// conversion.

export const KYC_FIELDS = ["aadhaarFrontUrl", "aadhaarBackUrl", "panCardUrl", "idCardUrl"] as const;
export type KycField = (typeof KYC_FIELDS)[number];

export const KYC_BUCKET = process.env.MEDIA_S3_KYC_BUCKET || "rsn-kyc";
export const KYC_PATH_PREFIX = "/api/kyc-file/";
const KEY_RE = /^kyc\/([A-Za-z0-9_-]+)\/([A-Za-z0-9._-]+)$/;

export function isKycField(field: string): field is KycField {
  return (KYC_FIELDS as readonly string[]).includes(field);
}

/** Parses "kyc/<owner>/<name>" into its owner id, or null if malformed. */
export function parseKycKey(key: string): { ownerId: string; name: string } | null {
  const m = KEY_RE.exec(key);
  return m ? { ownerId: m[1], name: m[2] } : null;
}

/**
 * Returns the private form of a KYC image URL, moving the object out of the
 * public bucket when needed. Values we can't move (external hosts, legacy
 * Azure URLs) are returned unchanged.
 */
export async function secureKycUrl<T extends string | null | undefined>(url: T, ownerId: string): Promise<T | string> {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith(KYC_PATH_PREFIX)) return url; // already private
  if (!MEDIA_PUBLIC_BASE || !url.startsWith(MEDIA_PUBLIC_BASE + "/")) return url;

  const srcKey = decodeURIComponent(url.slice(MEDIA_PUBLIC_BASE.length + 1).split("?")[0]);
  const name = srcKey.split("/").pop()!.replace(/[^A-Za-z0-9._-]/g, "_");
  const destKey = `kyc/${ownerId}/${name}`;
  const s3 = internalS3();

  await s3.send(
    new CopyObjectCommand({
      Bucket: KYC_BUCKET,
      Key: destKey,
      CopySource: `${MEDIA_BUCKET}/${encodeURIComponent(srcKey).replace(/%2F/g, "/")}`,
      CacheControl: "private, no-store",
      MetadataDirective: "COPY",
    }),
  );
  await s3.send(new DeleteObjectCommand({ Bucket: MEDIA_BUCKET, Key: srcKey }));
  return `${KYC_PATH_PREFIX}${destKey}`;
}

/** Secures every KYC field present on `data` in place. */
export async function secureKycFields<D extends Record<string, unknown>>(data: D, ownerId: string): Promise<D> {
  for (const f of KYC_FIELDS) {
    const v = data[f];
    if (typeof v === "string" && v) {
      (data as Record<string, unknown>)[f] = await secureKycUrl(v, ownerId);
    }
  }
  return data;
}
