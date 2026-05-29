// /onboarding/kyc - staff self-serve KYC. Three-step wizard that mirrors
// the reporter Expo app's register flow so editors / sub-editors get the
// same gated experience the mobile-app reporter sees:
//
//   Step 1  Personal details (name + email pre-filled by admin, the rest
//           the user fills here)
//   Step 2  KYC documents (Passport → Aadhaar → PAN)
//   Step 3  Banking (UPI + bank name + account + IFSC + branch - all
//           required as of 2026-05)
//
// Auto-save on blur via PATCH /api/onboarding/kyc; the final "Submit for
// review" button hits POST /api/onboarding/kyc/submit which validates
// required fields server-side and flips status to SUBMITTED. Email is
// read-only and shown as a label (admin sets it, only another admin can
// change it).
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Lock } from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pincodeToDistrict, pincodeToConstituency } from "@/data/pincodes";
// Use the Prisma-free subpath so the menu-schemas barrel (which references
// MenuItemTargetType enum *values* at module load) doesn't get pulled into
// the client bundle and explode with "Cannot read properties of undefined".
import { kycSubmitSchema } from "@rayalaseema/db/schemas";
import type { ZodError } from "zod";

// Per-step schemas - picked off the canonical kycSubmitSchema so the
// inline error messages on this wizard match the ones the server uses
// in /api/onboarding/kyc/submit. If a field's rule changes in the
// schema, both sides stay in lock-step.
const step1Schema = kycSubmitSchema.pick({
  fullName: true,
  dateOfBirth: true,
  address: true,
  city: true,
  pincode: true,
  primaryDistrict: true,
});
const step2Schema = kycSubmitSchema.pick({
  photoUrl: true,
  aadhaarNumber: true,
  aadhaarFrontUrl: true,
  aadhaarBackUrl: true,
  panNumber: true,
  panCardUrl: true,
});
const step3Schema = kycSubmitSchema.pick({
  upiId: true,
  bankName: true,
  bankAccount: true,
  bankIfsc: true,
  bankBranch: true,
});

// Flattens a ZodError into { field: firstMessage } for per-input
// highlighting. Same shape the reporter app uses (apps/reporter/src/lib
// /validation.ts), so the helper is duplicated rather than imported.
function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) out[key] = issue.message;
  }
  return out;
}

// Display helper: turn a bare Aadhaar string (digits only, any length) into
// the canonical "1234 5678 9012" grouping shown on Aadhaar cards. Pure
// display formatting - the stored value stays as 12 raw digits.
function formatAadhaar(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

interface ProfileDraft {
  kycStatus: "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";
  kycRejectionNote: string | null;
  // Identity (Step 1)
  fullName: string | null;
  fatherName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  primaryDistrict: string | null;
  experience: string | null;
  specialization: string | null;
  // KYC docs (Step 2)
  aadhaarNumber: string | null;
  aadhaarFrontUrl: string | null;
  aadhaarBackUrl: string | null;
  panNumber: string | null;
  panCardUrl: string | null;
  photoUrl: string | null;
  // Banking (Step 3)
  upiId: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;
}

const EMPTY: ProfileDraft = {
  kycStatus: "PENDING", kycRejectionNote: null,
  fullName: "", fatherName: "", dateOfBirth: "", gender: "",
  address: "", city: "", pincode: "", primaryDistrict: "",
  experience: "", specialization: "",
  aadhaarNumber: "", aadhaarFrontUrl: "", aadhaarBackUrl: "",
  panNumber: "", panCardUrl: "", photoUrl: "",
  upiId: "", bankName: "", bankAccount: "", bankIfsc: "", bankBranch: "",
};

// Rayalaseema districts - same slugs the reporter app uses.
const DISTRICTS = [
  { slug: "kurnool", label: "Kurnool" },
  { slug: "nandyal", label: "Nandyal" },
  { slug: "ananthapuramu", label: "Anantapur" },
  { slug: "sri-sathya-sai", label: "Sri Sathya Sai" },
  { slug: "ysr-kadapa", label: "YSR Kadapa" },
  { slug: "annamayya", label: "Annamayya" },
  { slug: "tirupati", label: "Tirupati" },
  { slug: "chittoor", label: "Chittoor" },
];

const EXPERIENCE_OPTIONS = [
  "None / Fresher",
  "Less than 1 year",
  "1 - 3 years",
  "3 - 5 years",
  "5 - 10 years",
  "10+ years",
];

export default function KycOnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [form, setForm] = useState<ProfileDraft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [, setSaving] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Pincode hint banner - mirrors the Expo register screen: green when
  // we found the pincode and auto-filled district/city, red when the
  // pincode falls outside the Rayalaseema dataset.
  const [pincodeInfo, setPincodeInfo] = useState<
    { status: "ok" | "outside"; district?: string } | null
  >(null);
  // Per-field inline error messages, populated on Next / Submit by the
  // step-scoped Zod schemas above. Each individual error is cleared the
  // moment the user re-saves that field (see saveField / saveImage /
  // saveFields below), so the red text disappears as they correct it.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErrors = useCallback((...keys: string[]) => {
    setErrors((e) => {
      if (!keys.some((k) => k in e)) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      return next;
    });
  }, []);

  // Email pre-filled by admin and locked - comes straight off the NextAuth
  // session so it stays in sync with the User row.
  const userEmail = (session?.user?.email as string | undefined) ?? "";

  useEffect(() => {
    fetch("/api/onboarding/kyc")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setForm({
            ...EMPTY,
            ...data.profile,
            // Date comes back as ISO; date input wants YYYY-MM-DD.
            dateOfBirth: data.profile.dateOfBirth
              ? String(data.profile.dateOfBirth).slice(0, 10)
              : "",
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Per-field save. Fires on blur - Aadhaar / PAN / bank inputs feel
  // sluggish if they save on every keystroke, and the form is long
  // enough that "click outside to commit" is intuitive.
  const saveField = useCallback(async (key: keyof ProfileDraft, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearErrors(key as string);
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      const res = await fetch("/api/onboarding/kyc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not save");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    }
    setSaving((s) => ({ ...s, [key]: false }));
  }, [clearErrors]);

  // Image uploads commit immediately when ImageUpload calls onChange.
  const saveImage = useCallback(async (key: keyof ProfileDraft, url: string) => {
    setForm((f) => ({ ...f, [key]: url }));
    await saveField(key, url);
  }, [saveField]);

  // Batched save - used by the pincode handler when a single keystroke
  // needs to commit pincode + district + city together. The PATCH route
  // already accepts any subset of profile fields. Restricted to plain
  // text fields so we don't accidentally overwrite kycStatus.
  type TextField = "pincode" | "primaryDistrict" | "city";
  const saveFields = useCallback(async (patch: Partial<Record<TextField, string>>) => {
    setForm((f) => ({ ...f, ...patch }));
    clearErrors(...(Object.keys(patch) as string[]));
    try {
      const res = await fetch("/api/onboarding/kyc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(patch).map(([k, v]) => [k, v || null]),
          ),
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not save");
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    }
  }, [clearErrors]);

  // Pincode → district + city auto-detect. Looked up against the offline
  // map at apps/admin/src/data/pincodes.ts (same data the Expo register
  // screen uses). Fires on every keystroke so the hint appears the
  // moment the 6th digit lands - no need to blur the field.
  const onPincodeChange = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    if (digits.length < 6) {
      setForm((f) => ({ ...f, pincode: digits }));
      setPincodeInfo(null);
      return;
    }
    const slug = pincodeToDistrict[digits];
    if (slug) {
      const constituency = pincodeToConstituency[digits] || "";
      // Auto-fill the city when the pincode resolves to a known
      // constituency; if it doesn't, leave whatever city the user typed.
      const cityPatch = constituency ? { city: constituency } : {};
      saveFields({ pincode: digits, primaryDistrict: slug, ...cityPatch });
      setPincodeInfo({ status: "ok", district: slug });
    } else {
      saveFields({ pincode: digits });
      setPincodeInfo({ status: "outside" });
    }
  }, [saveFields]);

  const submitForReview = async () => {
    // Validate every step before hitting the server so the user sees
    // inline errors instead of a generic server "missing field" toast.
    // If an earlier step has an issue, jump back to it.
    const e1 = validateStep(1);
    const e2 = validateStep(2);
    const e3 = validateStep(3);
    const all = { ...e1, ...e2, ...e3 };
    if (Object.keys(all).length > 0) {
      setErrors(all);
      const jumpTo: 1 | 2 | 3 =
        Object.keys(e1).length > 0 ? 1 : Object.keys(e2).length > 0 ? 2 : 3;
      if (jumpTo !== step) setStep(jumpTo);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding/kyc/submit", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Submit failed");
        setSubmitting(false);
        return;
      }
      toast.success("Submitted for review - usually verified within 24 hours.");
      setForm((f) => ({ ...f, kycStatus: "SUBMITTED", kycRejectionNote: null }));
      router.push("/");
    } catch (e: any) {
      toast.error(e?.message || "Submit failed");
    }
    setSubmitting(false);
  };

  const isVerified = form.kycStatus === "VERIFIED";
  const isSubmitted = form.kycStatus === "SUBMITTED";

  // Validates the current step against its Zod schema. On failure, paints
  // each invalid field's row with a red message and refuses to advance -
  // no toast. On success, clears any stale errors from earlier attempts
  // and moves to the next step.
  const validateStep = (n: 1 | 2 | 3): Record<string, string> => {
    const schema = n === 1 ? step1Schema : n === 2 ? step2Schema : step3Schema;
    const r = schema.safeParse({
      fullName: form.fullName ?? "",
      dateOfBirth: form.dateOfBirth ?? "",
      address: form.address ?? "",
      city: form.city ?? "",
      pincode: form.pincode ?? "",
      primaryDistrict: form.primaryDistrict ?? "",
      photoUrl: form.photoUrl ?? "",
      aadhaarNumber: form.aadhaarNumber ?? "",
      aadhaarFrontUrl: form.aadhaarFrontUrl ?? "",
      aadhaarBackUrl: form.aadhaarBackUrl ?? "",
      panNumber: form.panNumber ?? "",
      panCardUrl: form.panCardUrl ?? "",
      upiId: form.upiId ?? "",
      bankName: form.bankName ?? "",
      bankAccount: form.bankAccount ?? "",
      bankIfsc: form.bankIfsc ?? "",
      bankBranch: form.bankBranch ?? "",
    });
    return r.success ? {} : fieldErrors(r.error);
  };

  const goNext = () => {
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    if (step < 3) setStep(((step + 1) as 1 | 2 | 3));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stepName =
    step === 1 ? "Personal details" : step === 2 ? "KYC documents" : "Banking";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }} className="shadcn-scope">
        <header className="mb-6 max-w-3xl">
          <h1 className="text-2xl font-extrabold text-foreground">Complete your KYC</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Required for publishing and payouts. Each field auto-saves as you fill it -
            you can come back and finish any step later.
          </p>
          {isVerified && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 size={16} /> Your KYC is verified. Edits to verified data require admin approval.
            </div>
          )}
          {isSubmitted && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <Loader2 size={16} /> Submitted for review - the admin sees the latest version.
            </div>
          )}
          {form.kycStatus === "REJECTED" && form.kycRejectionNote && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-semibold">Admin&apos;s note:</p>
              <p className="mt-1 italic">&ldquo;{form.kycRejectionNote}&rdquo;</p>
            </div>
          )}
        </header>

        {/* Progress dots - same pattern as the Expo app's register wizard.
            Active step is solid brand red; completed earlier steps stay
            solid; future steps render as muted bars. */}
        <div className="mb-3 flex max-w-3xl items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1 w-12 rounded-full transition-colors",
                step >= s ? "bg-red-600" : "bg-slate-200",
              )}
            />
          ))}
        </div>
        <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-wider text-red-600">
          Step {step} of 3
        </p>
        <h2 className="mb-6 text-center text-lg font-extrabold text-foreground">
          {stepName}
        </h2>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your draft…</p>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {/* ───── STEP 1: Personal details ───── */}
            {step === 1 && (
              <Section title="Personal details">
                {/* Email read-only - admin sets it, only another admin can
                    change it. Locked icon + muted styling so the user
                    knows it's not editable. */}
                <Field label="Email (set by admin)">
                  <div className="relative">
                    <Input
                      value={userEmail}
                      readOnly
                      className="cursor-not-allowed bg-slate-50 pr-9 text-muted-foreground"
                    />
                    <Lock
                      size={14}
                      aria-hidden
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60"
                    />
                  </div>
                </Field>

                <Field label="Full name" required error={errors.fullName}>
                  <Input
                    defaultValue={form.fullName ?? ""}
                    onBlur={(e) => saveField("fullName", e.target.value)}
                    placeholder="As on Aadhaar"
                    disabled={isVerified}
                    className={errors.fullName ? "border-red-500" : undefined}
                  />
                </Field>

                <Field label="Father's name">
                  <Input
                    defaultValue={form.fatherName ?? ""}
                    onBlur={(e) => saveField("fatherName", e.target.value)}
                    disabled={isVerified}
                  />
                </Field>

                <Field label="Date of birth" required error={errors.dateOfBirth}>
                  <DatePicker
                    value={form.dateOfBirth ?? ""}
                    onChange={(v) => saveField("dateOfBirth", v)}
                    disabled={isVerified}
                    fromYear={1940}
                    toYear={new Date().getFullYear()}
                  />
                </Field>

                <Field label="Gender">
                  <ChipRow
                    options={["Male", "Female", "Other"]}
                    value={form.gender ?? ""}
                    onChange={(v) => saveField("gender", v)}
                    disabled={isVerified}
                  />
                </Field>

                {/* Pincode → District/City auto-detect. Same order the
                    Expo register screen uses: typing 6 digits fills the
                    district chip and (when we have a mapping) the city
                    below. */}
                <Field label="Pincode" required error={errors.pincode}>
                  <Input
                    value={form.pincode ?? ""}
                    onChange={(e) => onPincodeChange(e.target.value)}
                    placeholder="6 digits"
                    maxLength={6}
                    inputMode="numeric"
                    disabled={isVerified}
                    className={errors.pincode ? "border-red-500" : undefined}
                  />
                  {pincodeInfo?.status === "ok" && (
                    <p className="mt-1 text-xs text-emerald-600">
                      Detected{" "}
                      <span className="font-semibold">
                        {DISTRICTS.find((d) => d.slug === pincodeInfo.district)?.label ||
                          pincodeInfo.district}
                      </span>
                      . District{form.city ? " and city" : ""} filled for you.
                    </p>
                  )}
                  {pincodeInfo?.status === "outside" && (
                    <p className="mt-1 text-xs text-red-600">
                      That pincode isn&apos;t in the Rayalaseema dataset. Pick a
                      district below.
                    </p>
                  )}
                </Field>

                <Field label="Primary district" required error={errors.primaryDistrict}>
                  <ChipRow
                    options={DISTRICTS.map((d) => d.slug)}
                    labels={DISTRICTS.map((d) => d.label)}
                    value={form.primaryDistrict ?? ""}
                    onChange={(v) => saveField("primaryDistrict", v)}
                    disabled={isVerified}
                  />
                </Field>

                <Field label="City / Constituency" required error={errors.city}>
                  <Input
                    key={form.city ?? ""}
                    defaultValue={form.city ?? ""}
                    onBlur={(e) => saveField("city", e.target.value)}
                    placeholder="e.g. Kurnool, Allagadda, Adoni"
                    disabled={isVerified}
                    className={errors.city ? "border-red-500" : undefined}
                  />
                </Field>

                <Field label="Address" required error={errors.address}>
                  <Input
                    defaultValue={form.address ?? ""}
                    onBlur={(e) => saveField("address", e.target.value)}
                    placeholder="Door no, street, area"
                    disabled={isVerified}
                    className={errors.address ? "border-red-500" : undefined}
                  />
                </Field>

                <Field label="Years of media experience">
                  <ChipRow
                    options={EXPERIENCE_OPTIONS}
                    value={form.experience ?? ""}
                    onChange={(v) => saveField("experience", v)}
                    disabled={isVerified}
                  />
                </Field>

                <Field label="Specialization (optional)">
                  <Input
                    defaultValue={form.specialization ?? ""}
                    onBlur={(e) => saveField("specialization", e.target.value)}
                    placeholder="Politics, sports, crime…"
                    disabled={isVerified}
                  />
                </Field>
              </Section>
            )}

            {/* ───── STEP 2: KYC documents ───── */}
            {step === 2 && (
              <Section
                title="KYC documents *"
                subtitle="All fields required to submit for review."
              >
                {/* Passport-style photo first (highest-trust face shot), then
                    Aadhaar (number + both sides), then PAN. Same order as
                    the Expo app's step-2 wizard. */}
                <Field label="Passport-style photo" required error={errors.photoUrl}>
                  <ImageUpload
                    value={form.photoUrl ?? ""}
                    onChange={(url) => saveImage("photoUrl", url)}
                    uploadOnly
                  />
                </Field>

                <Field label="Aadhaar number" required error={errors.aadhaarNumber}>
                  <Input
                    // Controlled: display the stored 12-digit value as
                    // "1234 5678 9012" so it reads like a printed Aadhaar
                    // card. Spaces are inserted on every keystroke, but
                    // form state + the saved value stay as bare digits.
                    value={formatAadhaar(form.aadhaarNumber ?? "")}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                      setForm((f) => ({ ...f, aadhaarNumber: digits }));
                    }}
                    onBlur={(e) => saveField("aadhaarNumber", e.target.value.replace(/\D/g, ""))}
                    placeholder="1234 5678 9012"
                    maxLength={14}
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={isVerified}
                    className={errors.aadhaarNumber ? "border-red-500" : undefined}
                  />
                </Field>
                <Field label="Aadhaar - front" required error={errors.aadhaarFrontUrl}>
                  <ImageUpload
                    value={form.aadhaarFrontUrl ?? ""}
                    onChange={(url) => saveImage("aadhaarFrontUrl", url)}
                    uploadOnly
                  />
                </Field>
                <Field label="Aadhaar - back" required error={errors.aadhaarBackUrl}>
                  <ImageUpload
                    value={form.aadhaarBackUrl ?? ""}
                    onChange={(url) => saveImage("aadhaarBackUrl", url)}
                    uploadOnly
                  />
                </Field>

                <Field label="PAN number" required error={errors.panNumber}>
                  <Input
                    defaultValue={form.panNumber ?? ""}
                    onBlur={(e) => saveField("panNumber", e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    className={cn("uppercase", errors.panNumber && "border-red-500")}
                    disabled={isVerified}
                  />
                </Field>
                <Field label="PAN card photo" required error={errors.panCardUrl}>
                  <ImageUpload
                    value={form.panCardUrl ?? ""}
                    onChange={(url) => saveImage("panCardUrl", url)}
                    uploadOnly
                  />
                </Field>
              </Section>
            )}

            {/* ───── STEP 3: Banking ───── */}
            {step === 3 && (
              <Section
                title="Banking *"
                subtitle="All fields required - admin can't push a payout without them."
              >
                <Field label="UPI ID" required error={errors.upiId}>
                  <Input
                    defaultValue={form.upiId ?? ""}
                    onBlur={(e) => saveField("upiId", e.target.value)}
                    placeholder="name@upi"
                    disabled={isVerified}
                    className={errors.upiId ? "border-red-500" : undefined}
                  />
                </Field>
                <Field label="Bank name" required error={errors.bankName}>
                  <Input
                    defaultValue={form.bankName ?? ""}
                    onBlur={(e) => saveField("bankName", e.target.value)}
                    placeholder="e.g. SBI, HDFC, Axis"
                    disabled={isVerified}
                    className={errors.bankName ? "border-red-500" : undefined}
                  />
                </Field>
                <Field label="Bank account number" required error={errors.bankAccount}>
                  <Input
                    defaultValue={form.bankAccount ?? ""}
                    onBlur={(e) => saveField("bankAccount", e.target.value.replace(/\D/g, ""))}
                    placeholder="9-18 digits"
                    inputMode="numeric"
                    disabled={isVerified}
                    className={errors.bankAccount ? "border-red-500" : undefined}
                  />
                </Field>
                <Field label="IFSC code" required error={errors.bankIfsc}>
                  <Input
                    defaultValue={form.bankIfsc ?? ""}
                    onBlur={(e) => saveField("bankIfsc", e.target.value.toUpperCase())}
                    placeholder="SBIN0001234"
                    className={cn("uppercase", errors.bankIfsc && "border-red-500")}
                    maxLength={11}
                    disabled={isVerified}
                  />
                </Field>
                <Field label="Branch" required error={errors.bankBranch}>
                  <Input
                    defaultValue={form.bankBranch ?? ""}
                    onBlur={(e) => saveField("bankBranch", e.target.value)}
                    placeholder="e.g. Kurnool Main Branch"
                    disabled={isVerified}
                    className={errors.bankBranch ? "border-red-500" : undefined}
                  />
                </Field>
              </Section>
            )}

            {/* Wizard nav - Back is hidden on step 1, the right button
                changes from "Next" to "Submit for review" on the last
                step. Same affordance as the Expo wizard. */}
            <div className="flex items-center gap-3 pt-2">
              {step > 1 ? (
                <Button variant="outline" onClick={goBack} disabled={submitting}>
                  <ChevronLeft size={16} className="-ms-1" />
                  Back
                </Button>
              ) : (
                <span className="flex-1" />
              )}
              <div className="flex-1" />
              {step < 3 ? (
                <Button onClick={goNext} disabled={submitting}>
                  Next
                  <ChevronRight size={16} className="-me-1" />
                </Button>
              ) : (
                <Button
                  onClick={submitForReview}
                  disabled={submitting || isVerified}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {submitting ? "Submitting…" : isSubmitted ? "Re-submit" : "Submit for review"}
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ───── Small presentational helpers ─────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-white p-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">
        {label} {required && <span className="text-red-600">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

// Pill chips - matches the Expo register's chip rows for district / gender
// / experience selection. `labels` is optional; when omitted the `options`
// strings are shown as labels too (used for free-text-ish lists).
function ChipRow({
  options,
  labels,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  labels?: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt, i) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "border-red-600 bg-red-600 text-white"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {labels?.[i] ?? opt}
          </button>
        );
      })}
    </div>
  );
}
