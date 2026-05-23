// Single source of truth for the reporter-initiated profile-change flow.
//
// Defines every editable field, where it lives on the data model
// (User vs JournalistProfile), how it's validated, and whether changing it
// re-opens KYC ("kyc"-critical, pauses earnings until admin re-verifies) or
// affects payment routing ("bank"-critical, payments delayed until verified).
//
// Email, role and kycStatus are intentionally absent — they are admin-only.

import { KycStatus } from "@rayalaseema/db";

export type ProfileFieldKind = "string" | "text" | "date" | "url" | "string-array";
export type ProfileFieldModel = "user" | "journalist";
export type ProfileFieldCritical = "kyc" | "bank" | null;

// The canonical field name is the key under which the def lives in
// PROFILE_FIELDS, not a property on the def itself.
export interface ProfileFieldDef {
  model: ProfileFieldModel;
  column: string;
  kind: ProfileFieldKind;
  critical: ProfileFieldCritical;
  /** Returns an error message or null. The reporter API rejects with 400 on error. */
  validate: (value: unknown) => string | null;
}

// ─── Validators ──────────────────────────────────────────────────────────────

const reqStr = (min: number, max: number, label = "Value") => (v: unknown): string | null => {
  if (typeof v !== "string") return `${label} is required`;
  const t = v.trim();
  if (t.length < min) return `${label} must be at least ${min} characters`;
  if (t.length > max) return `${label} must be at most ${max} characters`;
  return null;
};

const optStr = (max: number, label = "Value") => (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return `${label} must be text`;
  if (v.trim().length > max) return `${label} must be at most ${max} characters`;
  return null;
};

const phone10 = (v: unknown): string | null => {
  if (typeof v !== "string") return "Phone is required";
  const d = v.replace(/\D/g, "");
  return /^[6-9]\d{9}$/.test(d) ? null : "Enter a valid 10-digit Indian mobile number";
};

const pincode6 = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  return typeof v === "string" && /^\d{6}$/.test(v.trim()) ? null : "Pincode must be 6 digits";
};

const aadhaar12 = (v: unknown): string | null => {
  if (typeof v !== "string") return "Aadhaar is required";
  const d = v.replace(/\D/g, "");
  return /^\d{12}$/.test(d) ? null : "Aadhaar must be 12 digits";
};

const pan10 = (v: unknown): string | null => {
  if (typeof v !== "string") return "PAN is required";
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(v.trim().toUpperCase()) ? null : "PAN format is invalid (e.g. ABCDE1234F)";
};

const ifsc11 = (v: unknown): string | null => {
  if (typeof v !== "string") return "IFSC is required";
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.trim().toUpperCase()) ? null : "IFSC format is invalid (e.g. SBIN0001234)";
};

const acctNum = (v: unknown): string | null => {
  if (typeof v !== "string") return "Account number is required";
  const d = v.replace(/\D/g, "");
  return /^\d{9,18}$/.test(d) ? null : "Account number must be 9–18 digits";
};

const upiId = (v: unknown): string | null => {
  if (typeof v !== "string") return "UPI ID is required";
  return /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(v.trim()) ? null : "UPI ID format is invalid (e.g. name@bank)";
};

const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== "string" || !v) return "Image is required";
  return /^https?:\/\//i.test(v) ? null : "Must be a valid uploaded image URL";
};

const dateOnly = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v !== "string") return "Date must be a string";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "Date is invalid";
  if (d.getTime() > Date.now()) return "Date must be in the past";
  return null;
};

const stringArr = (maxItems: number) => (v: unknown): string | null => {
  if (!Array.isArray(v)) return "Must be a list";
  if (v.length > maxItems) return `At most ${maxItems} items`;
  if (v.some((x) => typeof x !== "string")) return "Each item must be text";
  return null;
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const PROFILE_FIELDS = {
  // ── User model
  name:               { model: "user",       column: "name",            kind: "string",       critical: null,  validate: reqStr(2, 80, "Name") },
  phone:              { model: "user",       column: "phone",           kind: "string",       critical: null,  validate: phone10 },

  // ── Personal
  fatherName:         { model: "journalist", column: "fatherName",      kind: "string",       critical: null,  validate: optStr(80, "Father's name") },
  dateOfBirth:        { model: "journalist", column: "dateOfBirth",     kind: "date",         critical: null,  validate: dateOnly },
  gender:             { model: "journalist", column: "gender",          kind: "string",       critical: null,  validate: optStr(20, "Gender") },

  // ── Address & beat
  address:            { model: "journalist", column: "address",         kind: "text",         critical: null,  validate: optStr(500, "Address") },
  city:               { model: "journalist", column: "city",            kind: "string",       critical: null,  validate: optStr(80, "City") },
  pincode:            { model: "journalist", column: "pincode",         kind: "string",       critical: null,  validate: pincode6 },
  primaryDistrict:    { model: "journalist", column: "primaryDistrict", kind: "string",       critical: null,  validate: optStr(60, "District") },
  secondaryDistricts: { model: "journalist", column: "secondaryDistricts", kind: "string-array", critical: null, validate: stringArr(20) },

  // ── KYC documents (critical: kyc — pauses earnings until admin re-verifies)
  aadhaarNumber:      { model: "journalist", column: "aadhaarNumber",   kind: "string",       critical: "kyc", validate: aadhaar12 },
  aadhaarFrontUrl:    { model: "journalist", column: "aadhaarFrontUrl", kind: "url",          critical: "kyc", validate: httpsUrl },
  aadhaarBackUrl:     { model: "journalist", column: "aadhaarBackUrl",  kind: "url",          critical: "kyc", validate: httpsUrl },
  panNumber:          { model: "journalist", column: "panNumber",       kind: "string",       critical: "kyc", validate: pan10 },
  panCardUrl:         { model: "journalist", column: "panCardUrl",      kind: "url",          critical: "kyc", validate: httpsUrl },
  idCardUrl:          { model: "journalist", column: "idCardUrl",       kind: "url",          critical: "kyc", validate: httpsUrl },
  photoUrl:           { model: "journalist", column: "photoUrl",        kind: "url",          critical: "kyc", validate: httpsUrl },

  // ── Bank / payment (critical: bank — payments delayed until admin verifies)
  upiId:              { model: "journalist", column: "upiId",           kind: "string",       critical: "bank", validate: upiId },
  bankName:           { model: "journalist", column: "bankName",        kind: "string",       critical: "bank", validate: reqStr(2, 80, "Bank name") },
  bankAccount:        { model: "journalist", column: "bankAccount",     kind: "string",       critical: "bank", validate: acctNum },
  bankIfsc:           { model: "journalist", column: "bankIfsc",        kind: "string",       critical: "bank", validate: ifsc11 },
  bankBranch:         { model: "journalist", column: "bankBranch",      kind: "string",       critical: "bank", validate: optStr(80, "Branch") },

  // ── Misc
  experience:         { model: "journalist", column: "experience",      kind: "text",         critical: null,  validate: optStr(2000, "Experience") },
  specialization:     { model: "journalist", column: "specialization",  kind: "string",       critical: null,  validate: optStr(80, "Specialization") },
  languages:          { model: "journalist", column: "languages",       kind: "string-array", critical: null,  validate: stringArr(10) },
} as const satisfies Record<string, ProfileFieldDef>;

export type ProfileFieldName = keyof typeof PROFILE_FIELDS;

// Fields that cannot be changed via the reporter app at all — admin only.
export const LOCKED_FIELDS = new Set(["email", "role", "kycStatus"]);

export function isValidField(name: string): name is ProfileFieldName {
  return Object.prototype.hasOwnProperty.call(PROFILE_FIELDS, name);
}

// ─── Serialization (for storage in ProfileUpdateRequest.newValue / oldValue) ─

/** Normalize a submitted value and turn it into the canonical text form we store. */
export function serializeForStorage(def: ProfileFieldDef, value: unknown): string | null {
  if (value == null || value === "") return null;

  switch (def.kind) {
    case "string":
    case "text":
    case "url":
      return String(value).trim();
    case "date":
      return typeof value === "string" ? new Date(value).toISOString() : null;
    case "string-array":
      return JSON.stringify(value);
  }
}

/** Read a stored text value back into the runtime type to write to Prisma. */
export function deserializeForWrite(def: ProfileFieldDef, stored: string | null): unknown {
  if (stored == null) return null;

  switch (def.kind) {
    case "string":
    case "text":
    case "url":
      return stored;
    case "date":
      return new Date(stored);
    case "string-array":
      try { return JSON.parse(stored); } catch { return []; }
  }
}

/** Pulls the current value of `def` from a profile object that includes its user. */
export function getCurrentValue(
  profile: Record<string, any> & { user?: Record<string, any> | null },
  def: ProfileFieldDef
): unknown {
  return def.model === "user" ? profile.user?.[def.column] ?? null : profile[def.column] ?? null;
}

/** Stable text form for the OLD value so admins can see "was X → now Y". */
export function valueToStorage(def: ProfileFieldDef, value: unknown): string | null {
  if (value == null) return null;
  if (def.kind === "date" && value instanceof Date) return value.toISOString();
  if (def.kind === "string-array") return JSON.stringify(value ?? []);
  if (value === "") return null;
  return String(value);
}

// ─── KYC handling ────────────────────────────────────────────────────────────

/** Returns the kycStatus to set on the journalist when a request is submitted. */
export function newKycStatusOnRequest(def: ProfileFieldDef, currentStatus: KycStatus): KycStatus | null {
  // Submitting a KYC-critical change pauses earnings by flipping VERIFIED → SUBMITTED.
  // For other current statuses (PENDING / REJECTED / already SUBMITTED), leave as-is.
  if (def.critical === "kyc" && currentStatus === KycStatus.VERIFIED) {
    return KycStatus.SUBMITTED;
  }
  return null;
}
