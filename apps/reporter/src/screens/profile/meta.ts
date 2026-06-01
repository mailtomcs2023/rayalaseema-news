// Shared metadata for the reporter profile flow. Mirrors the server's
// apps/admin/src/lib/profile-fields.ts so client + server agree on which
// fields exist, which are KYC-critical, etc.
//
// The landing screen, every section screen, the pending screen and the
// edit sheet all import from here.

import { Ionicons } from "@expo/vector-icons";

export type IoniconName = keyof typeof Ionicons.glyphMap;
export type FieldKind = "string" | "text" | "date" | "url" | "string-array";
export type FieldCritical = "kyc" | "bank" | null;

export interface FieldMeta {
  labelKey: string;     // i18n key under "profile."
  icon: IoniconName;
  kind: FieldKind;
  critical: FieldCritical;
  numeric?: boolean;
  multiline?: boolean;
  /** If present, the EditSheet renders a chip selector instead of a text input. */
  options?: string[];
}

// Predefined option lists used by constrained fields (gender, specialization,
// languages). Kept here so the reporter app and any future settings UI stay
// in sync - admins can still write arbitrary values via the journalists page.
export const GENDER_OPTIONS = ["Male", "Female", "Other", "Prefer not to say"];
export const SPECIALIZATION_OPTIONS = [
  "Politics", "Crime", "Sports", "Business", "Entertainment",
  "Health", "Education", "Technology", "Agriculture", "General",
];
export const LANGUAGE_OPTIONS = ["Telugu", "English", "Hindi", "Tamil", "Kannada", "Urdu"];

export const FIELDS: Record<string, FieldMeta> = {
  // User
  name:               { labelKey: "name",            icon: "person-outline",         kind: "string",       critical: null },
  phone:              { labelKey: "phone",            icon: "call-outline",           kind: "string",       critical: null,  numeric: true },
  // Personal
  fatherName:         { labelKey: "fatherName",       icon: "people-outline",         kind: "string",       critical: null },
  dateOfBirth:        { labelKey: "dob",              icon: "calendar-outline",       kind: "date",         critical: null },
  gender:             { labelKey: "gender",           icon: "male-female-outline",    kind: "string",       critical: null, options: GENDER_OPTIONS },
  experience:         { labelKey: "experienceLabel",  icon: "school-outline",         kind: "text",         critical: null, multiline: true },
  specialization:     { labelKey: "specialization",   icon: "ribbon-outline",         kind: "string",       critical: null, options: SPECIALIZATION_OPTIONS },
  languages:          { labelKey: "languages",        icon: "language-outline",       kind: "string-array", critical: null, options: LANGUAGE_OPTIONS },
  // Address & beat
  address:            { labelKey: "address",          icon: "home-outline",           kind: "text",         critical: null,  multiline: true },
  city:               { labelKey: "city",             icon: "business-outline",       kind: "string",       critical: null },
  pincode:            { labelKey: "pincode",          icon: "pin-outline",            kind: "string",       critical: null,  numeric: true },
  primaryDistrict:    { labelKey: "district",         icon: "map-outline",            kind: "string",       critical: null },
  // KYC
  aadhaarNumber:      { labelKey: "aadhaarNumber",    icon: "card-outline",           kind: "string",       critical: "kyc", numeric: true },
  aadhaarFrontUrl:    { labelKey: "aadhaarFront",     icon: "image-outline",          kind: "url",          critical: "kyc" },
  aadhaarBackUrl:     { labelKey: "aadhaarBack",      icon: "image-outline",          kind: "url",          critical: "kyc" },
  panNumber:          { labelKey: "panNumber",        icon: "card-outline",           kind: "string",       critical: "kyc" },
  panCardUrl:         { labelKey: "panCard",          icon: "image-outline",          kind: "url",          critical: "kyc" },
  idCardUrl:          { labelKey: "idCard",           icon: "id-card-outline",        kind: "url",          critical: "kyc" },
  photoUrl:           { labelKey: "passportPhoto",    icon: "camera-outline",         kind: "url",          critical: "kyc" },
  // Bank
  upiId:              { labelKey: "upiId",            icon: "phone-portrait-outline", kind: "string",       critical: "bank" },
  bankName:           { labelKey: "bankName",         icon: "business-outline",       kind: "string",       critical: "bank" },
  bankAccount:        { labelKey: "bankAccount",      icon: "wallet-outline",         kind: "string",       critical: "bank", numeric: true },
  bankIfsc:           { labelKey: "bankIfsc",         icon: "key-outline",            kind: "string",       critical: "bank" },
  bankBranch:         { labelKey: "bankBranch",       icon: "location-outline",       kind: "string",       critical: "bank" },
};

// Icon family is part of the section metadata so the landing page can
// render the right glyph set per row. "ion" = Ionicons, "mc" = MaterialCommunityIcons.
export type SectionIcon =
  | { family: "ion"; name: IoniconName }
  | { family: "mc";  name: string };

export interface SectionDef {
  titleKey: string;       // i18n key under "profile."
  icon: SectionIcon;
  fields: string[];
}

// The grouped sections shown on the landing menu and rendered by
// /profile-section/[section]. The key is the URL slug.
export const SECTIONS: Record<string, SectionDef> = {
  personal: {
    titleKey: "personalInfo",
    icon: { family: "ion", name: "person-outline" },
    fields: ["name", "phone", "fatherName", "dateOfBirth", "gender", "experience", "specialization", "languages"],
  },
  address: {
    titleKey: "addressAndBeat",
    icon: { family: "ion", name: "map-outline" },
    fields: ["address", "city", "pincode", "primaryDistrict"],
  },
  kyc: {
    titleKey: "kycDocuments",
    icon: { family: "mc", name: "shield-lock-outline" },
    fields: ["aadhaarNumber", "aadhaarFrontUrl", "aadhaarBackUrl", "panNumber", "panCardUrl", "idCardUrl", "photoUrl"],
  },
  bank: {
    titleKey: "bankDetails",
    icon: { family: "ion", name: "wallet-outline" },
    fields: ["upiId", "bankName", "bankAccount", "bankIfsc", "bankBranch"],
  },
};

// ─── Response types matching /api/reporter/profile ─────────────────────────

export interface ProfileResponse {
  user: { id: string; name: string; email: string; phone: string | null; role: string; avatar: string | null };
  profile: any;
  requests: PendingRequest[];
}

export interface PendingRequest {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  status: "PENDING" | "REJECTED";
  reviewerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function initialsOf(name?: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function titleCase(s?: string | null) {
  return (s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getCurrentValue(data: ProfileResponse, field: string): unknown {
  if (field === "name" || field === "phone") return data.user[field as "name" | "phone"];
  return data.profile?.[field];
}

// Fields where we mask everything but the trailing digits - Aadhaar
// (last 4), PAN (last 4), bank account (last 4). Shoulder-surfing
// protection: even though the API decrypts on the wire, the reporter
// probably doesn't want their full Aadhaar visible to anyone glancing
// at the phone in a press conference. Reporter can tap to copy the full
// value if they need it (TODO: add reveal-on-tap later).
const MASKED_FIELDS = new Set(["aadhaarNumber", "panNumber", "bankAccount"]);

function maskTail(raw: string, visibleTail = 4): string {
  const s = String(raw);
  if (s.length <= visibleTail) return s;
  const tail = s.slice(-visibleTail);
  const masked = "•".repeat(Math.min(s.length - visibleTail, 8));
  return `${masked} ${tail}`;
}

export function formatDisplay(field: string, value: unknown, fallback = "-"): string {
  if (value == null || value === "") return fallback;
  if (MASKED_FIELDS.has(field)) return maskTail(String(value));
  const meta = FIELDS[field];
  if (!meta) return String(value);
  switch (meta.kind) {
    case "date":
      try { return new Date(value as string).toLocaleDateString(); } catch { return String(value); }
    case "string-array":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "url":
      return ""; // shown as a thumbnail, not text
    default:
      return String(value);
  }
}

// Compact preview text used by pending chips / pending-list rows.
export function previewNewValue(field: string, stored: string | null): string {
  if (!stored) return "-";
  const meta = FIELDS[field];
  if (!meta) return stored;
  if (meta.kind === "string-array") {
    try { return JSON.parse(stored).join(", "); } catch { return stored; }
  }
  if (meta.kind === "date") {
    try { return new Date(stored).toLocaleDateString(); } catch { return stored; }
  }
  if (meta.kind === "url") return "📷";
  return stored;
}

export const KYC_STATUS_KEY: Record<string, string> = {
  PENDING:   "kycPending",
  SUBMITTED: "kycSubmitted",
  VERIFIED:  "kycVerified",
  REJECTED:  "kycRejected",
};

export const KYC_STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  PENDING:   { bg: "#f3f4f6", fg: "#555" },
  SUBMITTED: { bg: "#fef3c7", fg: "#92400e" },
  VERIFIED:  { bg: "#dcfce7", fg: "#166534" },
  REJECTED:  { bg: "#fef2f2", fg: "#dc2626" },
};
