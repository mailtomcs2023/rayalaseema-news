"use client";

// KYC review dialog - opens from the /users row dropdown and lets the admin
// inspect a user's submitted documents, banking, and decide
// Verify / Reject with a mandatory rejection reason. Works for any role,
// not just REPORTERs - the same gate applies to editors and sub-editors now
// that KYC is required for all editorial users.
//
// Self-contained: takes only `userId`, fetches the full profile from
// /api/users/[id]/profile on open, calls the existing /api/reporters POST
// for verify/reject actions (those handlers operate on reporterProfile
// rows so they work for any role with a profile).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const REJECTION_REASONS = [
  "Aadhaar photo unclear or blurry",
  "PAN card photo unclear or blurry",
  "Selfie does not match the Aadhaar photo",
  "Aadhaar number does not match the document",
  "PAN number is invalid",
  "Bank account details look incorrect",
  "Documents appear edited or tampered",
  "Wrong document type uploaded",
] as const;
const REJECTION_OTHER = "__other__";

const KYC_BADGE: Record<string, string> = {
  VERIFIED: "bg-green-100 text-green-700 border-green-200",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
  "NO PROFILE": "bg-muted text-muted-foreground border-transparent",
};

interface FullUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
  role: string;
  reporterProfile: any | null;
  _count?: { contents: number; contentPayments: number };
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "-");
const fmtAadhaar = (n?: string | null) => (n ? n.replace(/(\d{4})(?=\d)/g, "$1 ") : "");

export function KycReviewDialog({
  userId,
  onClose,
  onChanged,
}: {
  userId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [user, setUser] = useState<FullUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Fetch the full user + decrypted profile when the dialog opens, and
  // reset all transient state when a different user is selected.
  useEffect(() => {
    setRejectReason("");
    setRejectNote("");
    setRejectError(null);
    if (!userId) return;
    setLoading(true);
    fetch(`/api/users/${userId}/profile`)
      .then((r) => r.json())
      .then((data: FullUser) => setUser(data))
      .catch(() => toast.error("Could not load profile"))
      .finally(() => setLoading(false));
  }, [userId]);

  const refetch = async () => {
    if (!userId) return;
    const data = await fetch(`/api/users/${userId}/profile`).then((r) => r.json());
    setUser(data);
  };

  const p = user?.reporterProfile ?? null;

  const act = async (action: string, note?: string) => {
    if (!p) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reporters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: p.id, action, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Action failed");
        return;
      }
      toast.success(action === "verify" ? "KYC verified." : "KYC rejected.");
      onChanged?.();
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const hasDocs = !!(
    p &&
    (p.photoUrl || p.aadhaarFrontUrl || p.aadhaarBackUrl || p.panCardUrl || p.idCardUrl)
  );

  return (
    <Dialog open={!!userId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        {loading || !user ? (
          <>
            {/* Radix requires a DialogTitle on every render of DialogContent
                for screen readers - render a visually-hidden one during
                the loading branch so the real header below can stay
                inside the data-loaded block. */}
            <DialogTitle className="sr-only">Loading KYC profile</DialogTitle>
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {user.name}
                <Badge
                  variant="outline"
                  className={cn("border", KYC_BADGE[p?.kycStatus || "NO PROFILE"])}
                >
                  {p?.kycStatus || "NO PROFILE"}
                </Badge>
                <Badge variant="outline" className="border">
                  {user.role}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {user.email}
                {user.phone ? ` · ${user.phone}` : ""}
              </DialogDescription>
            </DialogHeader>

            {!p ? (
              <p className="text-sm text-muted-foreground">
                This user has not started a KYC profile yet. Once they sign in and submit
                their documents, the review controls will appear here.
              </p>
            ) : (
              <div className="text-sm">
                {hasDocs && (
                  <>
                    <SectionTitle>Documents</SectionTitle>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <DocThumb label="Passport Photo" url={p.photoUrl} />
                      <DocThumb label="Aadhaar Front" url={p.aadhaarFrontUrl} />
                      <DocThumb label="Aadhaar Back" url={p.aadhaarBackUrl} />
                      <DocThumb label="PAN Card" url={p.panCardUrl} />
                      <DocThumb label="Press / ID Card" url={p.idCardUrl} />
                    </div>
                  </>
                )}

                <SectionTitle>Personal</SectionTitle>
                <Field label="Father's Name" value={p.fatherName} />
                <Field label="Date of Birth" value={p.dateOfBirth ? fmtDate(p.dateOfBirth) : null} />
                <Field label="Gender" value={p.gender} />
                <Field label="Address" value={p.address} />
                <Field label="City" value={p.city} />
                <Field label="Pincode" value={p.pincode} />
                <Field label="Primary District" value={p.primaryDistrict} />
                <Field label="Other Districts" value={p.secondaryDistricts?.join(", ")} />
                <Field label="Languages" value={p.languages?.join(", ")} />
                <Field label="Specialization" value={p.specialization} />
                <Field label="Experience" value={p.experience} />

                <SectionTitle>KYC Details</SectionTitle>
                <Field label="Aadhaar No." value={fmtAadhaar(p.aadhaarNumber)} />
                <Field label="PAN No." value={p.panNumber} />

                <SectionTitle>Bank / Payment</SectionTitle>
                <Field label="UPI ID" value={p.upiId} />
                <Field label="Bank Name" value={p.bankName} />
                <Field label="Account No." value={p.bankAccount} />
                <Field label="IFSC" value={p.bankIfsc} />
                <Field label="Branch" value={p.bankBranch} />

                <SectionTitle>Activity</SectionTitle>
                <Field label="Articles" value={String(user._count?.contents ?? 0)} />
                <Field label="Payments" value={String(user._count?.contentPayments ?? 0)} />
                <Field label="Account" value={user.active ? "Active" : "Inactive"} />
                <Field label="Joined" value={fmtDate(user.createdAt)} />
                <Field label="Verified" value={p.verifiedAt ? fmtDate(p.verifiedAt) : null} />

                {p.kycRejectionNote && (
                  <div className="mt-3 rounded-md border-l-2 border-red-500 bg-red-50 p-2.5">
                    <p className="text-[11px] font-bold text-red-600">Rejection Note</p>
                    <p className="text-xs text-muted-foreground">{p.kycRejectionNote}</p>
                  </div>
                )}

                <SectionTitle>KYC Decision</SectionTitle>
                <div className="space-y-2">
                  {p.kycStatus !== "VERIFIED" && (
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700"
                      disabled={busy}
                      onClick={() => act("verify")}
                    >
                      Verify &amp; Approve KYC ✓
                    </Button>
                  )}
                  {p.kycStatus !== "REJECTED" && (
                    <>
                      <Select
                        value={rejectReason}
                        onValueChange={(v) => {
                          setRejectReason(v);
                          if (rejectError) setRejectError(null);
                        }}
                      >
                        <SelectTrigger className="w-full" aria-invalid={!!rejectError}>
                          <SelectValue placeholder="Select a rejection reason (required)" />
                        </SelectTrigger>
                        <SelectContent>
                          {REJECTION_REASONS.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                          <SelectItem value={REJECTION_OTHER}>Other (type a custom reason)</SelectItem>
                        </SelectContent>
                      </Select>
                      {rejectReason === REJECTION_OTHER && (
                        <Input
                          onChange={(e) => {
                            setRejectNote(e.target.value);
                            if (rejectError) setRejectError(null);
                          }}
                          placeholder="Describe the reason - the user will see this"
                          value={rejectNote}
                          aria-invalid={!!rejectError}
                        />
                      )}
                      {rejectError && (
                        <p className="-mt-1 text-xs text-red-600">{rejectError}</p>
                      )}
                      <Button
                        className="w-full"
                        disabled={busy}
                        onClick={() => {
                          if (!rejectReason) {
                            setRejectError("Please select a rejection reason.");
                            return;
                          }
                          const finalNote =
                            rejectReason === REJECTION_OTHER ? rejectNote.trim() : rejectReason;
                          if (!finalNote) {
                            setRejectError("Please describe the reason - the user sees this.");
                            return;
                          }
                          act("reject", finalNote);
                        }}
                        variant="destructive"
                      >
                        {p.kycStatus === "VERIFIED" ? "Revoke Verification" : "Reject KYC"}
                      </Button>
                    </>
                  )}
                  {p.kycStatus === "VERIFIED" && (
                    <p className="text-xs text-muted-foreground">
                      KYC is verified. Use &ldquo;Revoke Verification&rdquo; only if this was a mistake.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <p className="leading-relaxed">
      <span className="font-semibold text-foreground">{label}:</span>{" "}
      <span className="text-muted-foreground">{value}</span>
    </p>
  );
}

function DocThumb({ label, url }: { label: string; url?: string | null }) {
  if (!url) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] text-muted-foreground">{label}</p>
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={label} className="block w-full rounded-md border" src={url} />
      </a>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 mt-4 border-b pb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}
