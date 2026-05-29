// Zod form schemas for the reporter app.
//
// Each schema is a function of `t` so the validation messages follow the
// app's current language. Call e.g. step1Schema(t).safeParse(values), then
// feed a failure into fieldErrors() to get { fieldName: message }.
import { z } from "zod";

type TFn = (key: string) => string;

// Indian-format patterns.
const PHONE_RE = /^[6-9][0-9]{9}$/;          // 10 digits, starts 6-9
const AADHAAR_RE = /^[0-9]{12}$/;            // 12 digits (raw, no spaces)
// The 4th char of a PAN encodes the holder type: P individual, C company,
// H HUF, F firm/LLP, A AOP, T trust, B BOI, L local authority,
// J artificial juridical person, G government.
export const PAN_HOLDER_TYPES = "ABCFGHJLPT";
export const PAN_RE = new RegExp(`^[A-Z]{3}[${PAN_HOLDER_TYPES}][A-Z][0-9]{4}[A-Z]$`); // e.g. ABCPD1234E
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;   // e.g. SBIN0001234
const ACCOUNT_RE = /^[0-9]{9,18}$/;         // bank account: 9-18 digits
const UPI_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/; // e.g. name@upi

// Optional field: valid only when empty OR matching the pattern.
const optionalMatch = (re: RegExp, message: string) =>
  z.string().refine((v) => v === "" || re.test(v), message);

export function loginSchema(t: TFn) {
  return z.object({
    email: z.string().trim().min(1, t("validation.required")).email(t("validation.email")),
    password: z.string().min(1, t("validation.required")),
  });
}

// DOB stored on the form as "YYYY-MM-DD"; the date picker only emits this
// shape so we just need a length check + the date-shape regex.
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

// Register - step 1: personal details. Required fields are marked * in the UI.
// Mirrors the server-side kycSubmitSchema (packages/db/src/user-input-schemas.ts)
// so a flow that passes step 1 here also passes the "Submit for review"
// gate on the server - no surprise 400s after the user has uploaded docs.
export function step1Schema(t: TFn) {
  // Confirm-email is a typo-catcher (we don't send OTP, so we can't prove
  // ownership - at least force the reporter to type their email twice so a
  // silent typo doesn't create a useless account they can never log in to).
  // Compared case-insensitively + trimmed to match how the server stores it.
  return z.object({
    fullName: z.string().trim().min(1, t("validation.required")),
    email: z.string().trim().min(1, t("validation.required")).email(t("validation.email")),
    emailConfirm: z.string().trim().min(1, t("validation.required")),
    phone: z.string().regex(PHONE_RE, t("validation.phone")),
    password: z.string().min(8, t("validation.password")),
    dateOfBirth: z.string().regex(DOB_RE, t("validation.required")),
    address: z.string().trim().min(1, t("validation.required")),
    city: z.string().trim().min(1, t("validation.required")),
    pincode: z.string().regex(/^[0-9]{6}$/, t("validation.pincode")),
    primaryDistrict: z.string().trim().min(1, t("validation.required")),
  }).refine(
    (d) => d.email.trim().toLowerCase() === d.emailConfirm.trim().toLowerCase(),
    { path: ["emailConfirm"], message: t("validation.emailMismatch") },
  );
}

// Variant of step1 used by the "Complete registration" flow for reporters
// the admin created in the portal. Email + password are already set on
// the server (admin chose them), so the screen hides those fields and
// this schema drops them. Everything else still has to match the web's
// kycSubmitSchema personal section.
export function step1CompleteSchema(t: TFn) {
  return z.object({
    fullName: z.string().trim().min(1, t("validation.required")),
    phone: z.string().regex(PHONE_RE, t("validation.phone")),
    dateOfBirth: z.string().regex(DOB_RE, t("validation.required")),
    address: z.string().trim().min(1, t("validation.required")),
    city: z.string().trim().min(1, t("validation.required")),
    pincode: z.string().regex(/^[0-9]{6}$/, t("validation.pincode")),
    primaryDistrict: z.string().trim().min(1, t("validation.required")),
  });
}

// Register - step 2: KYC. Everything is required.
export function step2Schema(t: TFn) {
  return z.object({
    aadhaarNumber: z.string().regex(AADHAAR_RE, t("validation.aadhaar")),
    panNumber: z.string().regex(PAN_RE, t("validation.pan")),
    photoUri: z.string().min(1, t("validation.docRequired")),
    aadhaarFrontUri: z.string().min(1, t("validation.docRequired")),
    aadhaarBackUri: z.string().min(1, t("validation.docRequired")),
    panCardUri: z.string().min(1, t("validation.docRequired")),
  });
}

// Register - step 3: bank / payout. EVERY field required as of 2026-05 -
// editors + sub-editors share the same flow now and payouts can't be
// pushed with any of these blank, so we'd rather catch it upfront than
// surface a first-payout failure two weeks later.
export function step3Schema(t: TFn) {
  return z.object({
    upiId: z.string().regex(UPI_RE, t("validation.upi")),
    bankName: z.string().trim().min(1, t("validation.required")),
    bankAccount: z.string().regex(ACCOUNT_RE, t("validation.account")),
    bankIfsc: z.string().regex(IFSC_RE, t("validation.ifsc")),
    bankBranch: z.string().trim().min(1, t("validation.required")),
  });
}

// Profile - change password. The new password must be at least 8 chars and
// the confirmation field must match it.
export function changePasswordSchema(t: TFn) {
  return z
    .object({
      currentPassword: z.string().min(1, t("validation.required")),
      newPassword: z.string().min(8, t("validation.password")),
      confirmPassword: z.string().min(1, t("validation.required")),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      message: t("validation.passwordMatch"),
      path: ["confirmPassword"],
    });
}

// New Article - title and body required, a category must be picked.
export function articleSchema(t: TFn) {
  return z.object({
    title: z.string().trim().min(1, t("validation.required")),
    body: z.string().trim().min(1, t("validation.required")),
    categoryId: z.string().min(1, t("validation.category")),
  });
}

// Flattens a ZodError into { field: firstMessage } for per-input highlighting.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}
