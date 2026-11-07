// One-off (idempotent): move existing KYC document images (Aadhaar/PAN/ID
// card) out of the PUBLIC media bucket into the private KYC bucket, and
// rewrite the stored URLs to /api/kyc-file/... paths.
//
// Run under Node (Bun's TLS ignores the internal MinIO CA):
//   cd apps/admin && bunx tsx --env-file=.env scripts/migrate-kyc-private.ts [--apply]
// Without --apply it only reports what it would change.
import { prisma } from "@rayalaseema/db";
import { KYC_FIELDS, isKycField, secureKycUrl, KYC_PATH_PREFIX } from "../src/lib/kyc-storage";
import { MEDIA_PUBLIC_BASE } from "../src/lib/blob";

const APPLY = process.argv.includes("--apply");
const isPublic = (v: unknown): v is string =>
  typeof v === "string" && !!MEDIA_PUBLIC_BASE && v.startsWith(MEDIA_PUBLIC_BASE + "/");

async function main() {
  if (!MEDIA_PUBLIC_BASE) throw new Error("MEDIA_PUBLIC_BASE_URL not set");
  const moved = new Map<string, string>(); // old public URL -> new private path

  async function secure(url: string, ownerId: string): Promise<string> {
    if (moved.has(url)) return moved.get(url)!;
    if (!APPLY) return `${KYC_PATH_PREFIX}kyc/${ownerId}/(dry-run)`;
    const out = (await secureKycUrl(url, ownerId)) as string;
    moved.set(url, out);
    return out;
  }

  // 1) Reporter profiles
  const profiles = await prisma.reporterProfile.findMany({
    select: { id: true, userId: true, aadhaarFrontUrl: true, aadhaarBackUrl: true, panCardUrl: true, idCardUrl: true },
  });
  let profileFields = 0;
  for (const p of profiles) {
    const data: Record<string, string> = {};
    for (const f of KYC_FIELDS) {
      const v = (p as Record<string, unknown>)[f];
      if (isPublic(v)) data[f] = await secure(v, p.userId);
    }
    if (Object.keys(data).length) {
      profileFields += Object.keys(data).length;
      console.log(`profile ${p.id}: ${Object.keys(data).join(", ")}`);
      if (APPLY) await prisma.reporterProfile.update({ where: { id: p.id }, data });
    }
  }

  // 2) Profile change requests carrying KYC image URLs (old or new value)
  const reqs = await prisma.profileUpdateRequest.findMany({
    where: { field: { in: [...KYC_FIELDS] } },
    select: { id: true, field: true, oldValue: true, newValue: true, reporterProfile: { select: { userId: true } } },
  });
  let reqFields = 0;
  for (const r of reqs) {
    if (!isKycField(r.field)) continue;
    const data: Record<string, string> = {};
    for (const col of ["oldValue", "newValue"] as const) {
      const v = r[col];
      if (!isPublic(v)) continue;
      try {
        data[col] = await secure(v, r.reporterProfile.userId);
      } catch (e: any) {
        // Object may already have moved under a different row; leave as-is.
        console.warn(`request ${r.id} ${col}: ${e?.name || e}`);
      }
    }
    if (Object.keys(data).length) {
      reqFields += Object.keys(data).length;
      if (APPLY) await prisma.profileUpdateRequest.update({ where: { id: r.id }, data });
    }
  }

  console.log(`${APPLY ? "APPLIED" : "DRY RUN"}: profile fields=${profileFields}, request fields=${reqFields}, objects moved=${moved.size}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
