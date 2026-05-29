// User + Reporter create/update body validation. Used at the API boundary
// by /api/users (admin user CRUD) and /api/reporters (KYC + actions).
import { z } from "zod";

const NAME_MAX = 120;
const EMAIL_MAX = 320; // RFC 5321
const PHONE_MAX = 32;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const BIO_MAX = 1000;
const URL_MAX = 2048;
const ADDRESS_MAX = 500;

const cuid = z.string().trim().min(1).max(64);

// Hard upper bound on the categoryIds array. Sized to be effectively
// uncapped for real usage (the live taxonomy is in the dozens; even a
// 10x growth still fits comfortably) while still rejecting the
// pathological 100k-element body that would otherwise hit Prisma.
const CATEGORY_IDS_MAX = 5000;

const ROLE_VALUES = ["ADMIN", "EDITOR", "SUB_EDITOR", "REPORTER", "USER"] as const;
const KYC_STATUS_VALUES = ["PENDING", "SUBMITTED", "VERIFIED", "REJECTED"] as const;

// ---------- /api/users ----------

// POST /api/users - admin creates a new account.
export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(NAME_MAX),
  email: z.string().trim().email("Invalid email").max(EMAIL_MAX),
  password: z.string().min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`).max(PASSWORD_MAX),
  role: z.enum(ROLE_VALUES).optional(),
  bio: z.string().max(BIO_MAX).optional().nullable(),
  phone: z.string().trim().max(PHONE_MAX).optional().nullable(),
  // Pre-create an account in inactive state - used when an admin sets up an
  // account ahead of time and wants it disabled until the user is ready.
  // UI sends this on create even when value is `true`, so it has to be in
  // the schema or strict() rejects the whole body.
  active: z.boolean().optional(),
  // Force-change-on-first-login flag.
  mustChangePassword: z.boolean().optional(),
  // SUB_EDITOR / EDITOR get assigned to categories. The cap below is a
  // request-size guard against pathological bodies, not a business rule -
  // it must stay well above any realistic total category count so it
  // never bites real admins (a senior editor owning every category, for
  // example). Raise it further if the taxonomy grows past a few thousand.
  categoryIds: z.array(cuid).max(CATEGORY_IDS_MAX).optional(),
}).strict();

// PUT /api/users/[id] - admin edits an account. Every field optional.
// Password is the one twist: empty string means "don't change", but if
// provided it must meet the min-length rule.
export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX).optional(),
  email: z.string().trim().email().max(EMAIL_MAX).optional(),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX).optional().or(z.literal("")),
  role: z.enum(ROLE_VALUES).optional(),
  bio: z.string().max(BIO_MAX).optional().nullable(),
  phone: z.string().trim().max(PHONE_MAX).optional().nullable(),
  active: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  categoryIds: z.array(cuid).max(CATEGORY_IDS_MAX).optional(),
}).strict();

// ---------- /api/reporters ----------

// The reporter API is action-dispatched: one POST endpoint, multiple shapes.
// Each `data` payload below maps to one `action` value the route accepts.

// Shared ReporterProfile field shape. Used by both create-data and
// update-data branches.
const reporterProfileFields = {
  fullName: z.string().trim().min(1).max(NAME_MAX).optional(),
  fatherName: z.string().trim().max(NAME_MAX).optional().nullable(),
  // Date in YYYY-MM-DD or ISO format - route does the parse.
  dateOfBirth: z.string().trim().max(40).optional().nullable(),
  gender: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(ADDRESS_MAX).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  pincode: z.string().trim().max(20).optional().nullable(),
  primaryDistrict: z.string().trim().max(100).optional().nullable(),
  // Encrypted fields - accept any string, the route encrypts on the way in.
  aadhaarNumber: z.string().trim().max(200).optional().nullable(),
  panNumber: z.string().trim().max(200).optional().nullable(),
  upiId: z.string().trim().max(200).optional().nullable(),
  bankName: z.string().trim().max(200).optional().nullable(),
  bankAccount: z.string().trim().max(200).optional().nullable(),
  bankIfsc: z.string().trim().max(20).optional().nullable(),
  bankBranch: z.string().trim().max(200).optional().nullable(),
  experience: z.string().trim().max(500).optional().nullable(),
  specialization: z.string().trim().max(200).optional().nullable(),
  // languages can arrive as a string ("Telugu, English") or array. The
  // route splits the string version; here we just accept either shape.
  languages: z.union([z.string().max(500), z.array(z.string().max(60)).max(20)]).optional(),
  kycStatus: z.enum(KYC_STATUS_VALUES).optional(),
} as const;

const reporterCreateData = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  email: z.string().trim().email().max(EMAIL_MAX),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  phone: z.string().trim().max(PHONE_MAX).optional().nullable(),
  active: z.boolean().optional(),
  ...reporterProfileFields,
}).passthrough();

const reporterUpdateData = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  email: z.string().trim().email().max(EMAIL_MAX),
  phone: z.string().trim().max(PHONE_MAX).optional().nullable(),
  active: z.boolean().optional(),
  ...reporterProfileFields,
}).passthrough();

// Discriminated union on `action` - each branch validates only the fields
// that branch actually uses.
export const reporterActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: reporterCreateData }),
  z.object({ action: z.literal("update"), userId: cuid, data: reporterUpdateData }),
  z.object({ action: z.literal("delete"), userIds: z.array(cuid).min(1).max(500) }),
  z.object({ action: z.literal("activate"), userIds: z.array(cuid).min(1).max(500) }),
  z.object({ action: z.literal("verify"), profileId: cuid, note: z.string().max(2000).optional() }),
  z.object({ action: z.literal("reject"), profileId: cuid, note: z.string().trim().min(1).max(2000) }),
  z.object({
    action: z.literal("reset-password"),
    profileId: cuid,
    customPassword: z.string().max(PASSWORD_MAX).optional(),
    oneTime: z.boolean().optional(),
  }),
]);

// ---------- KYC submit gate (Reporter + Editor + Sub-Editor) ----------
//
// Used by /api/reporter/kyc + the web /onboarding/kyc submit handler to
// guarantee that a profile moving from PENDING/REJECTED → SUBMITTED has
// every required field populated. The partial save endpoints stay loose;
// this schema runs at the "Submit for review" boundary only.

// IFSC = 4 letters + 0 + 6 alphanumerics. Codified by RBI.
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
// Bank account: 9-18 digits. Covers SBI (11), HDFC (14), etc. without
// being SO loose that "1" passes.
const ACCOUNT_RE = /^\d{9,18}$/;
// UPI handle: <handle>@<provider>. Accept letters/digits/dot/underscore/
// hyphen on the LHS, the provider on the RHS.
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
// Aadhaar: 12 digits exactly (we store encrypted ciphertext, so the
// length check applies to the plaintext at the API boundary only).
const AADHAAR_RE = /^\d{12}$/;
// PAN: 5 letters + 4 digits + 1 letter. The 4th letter (index 3)
// signals holder type - P for individual is the common case but we
// accept the full set ABCFGHLJPT.
const PAN_RE = /^[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]$/;

export const kycSubmitSchema = z.object({
  // Personal
  fullName: z.string().trim().min(1, "Full name is required").max(NAME_MAX),
  dateOfBirth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD"),
  address: z.string().trim().min(1, "Address is required").max(ADDRESS_MAX),
  city: z.string().trim().min(1, "City is required").max(100),
  pincode: z.string().trim().regex(/^\d{6}$/, "Pincode must be 6 digits"),
  primaryDistrict: z.string().trim().min(1, "Primary district is required").max(100),

  // KYC documents - encrypted aadhaar/pan numbers; *Url are upload URLs
  aadhaarNumber: z.string().trim().regex(AADHAAR_RE, "Aadhaar must be 12 digits"),
  aadhaarFrontUrl: z.string().trim().min(1, "Aadhaar front image is required"),
  aadhaarBackUrl: z.string().trim().min(1, "Aadhaar back image is required"),
  panNumber: z.string().trim().regex(PAN_RE, "Invalid PAN format"),
  panCardUrl: z.string().trim().min(1, "PAN card image is required"),
  photoUrl: z.string().trim().min(1, "Passport-style photo is required"),

  // Bank - ALL mandatory now (was previously optional). Editorial users
  // get paid via this; admin can't push a payment if any of these is
  // blank, so requiring upfront avoids first-payout scrambles.
  upiId: z.string().trim().regex(UPI_RE, "UPI ID must look like name@bank"),
  bankName: z.string().trim().min(1, "Bank name is required").max(200),
  bankAccount: z.string().trim().regex(ACCOUNT_RE, "Account must be 9-18 digits"),
  bankIfsc: z.string().trim().regex(IFSC_RE, "Invalid IFSC (e.g. SBIN0001234)"),
  bankBranch: z.string().trim().min(1, "Branch is required").max(200),
}).passthrough();

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type ReporterActionInput = z.infer<typeof reporterActionSchema>;
export type KycSubmitInput = z.infer<typeof kycSubmitSchema>;
