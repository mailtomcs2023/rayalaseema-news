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
  // SUB_EDITOR / EDITOR get assigned to categories. Cap at 50 since a real
  // sub-editor handles 1-5; anything more is a UI/seed bug.
  categoryIds: z.array(cuid).max(50).optional(),
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
  categoryIds: z.array(cuid).max(50).optional(),
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

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type ReporterActionInput = z.infer<typeof reporterActionSchema>;
