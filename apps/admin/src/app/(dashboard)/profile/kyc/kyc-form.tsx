"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/image-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Values = {
  aadhaarNumber: string;
  panNumber: string;
  photoUrl: string;
  aadhaarFrontUrl: string;
  aadhaarBackUrl: string;
  panCardUrl: string;
};

type Status = "PENDING" | "SUBMITTED" | "VERIFIED" | "REJECTED";

const STATUS_PILL: Record<
  Status,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  PENDING:   { label: "KYC pending",       bg: "#fef3c7", text: "#92400e", icon: <Clock size={12} /> },
  SUBMITTED: { label: "KYC under review",  bg: "#dbeafe", text: "#1d4ed8", icon: <Clock size={12} /> },
  VERIFIED:  { label: "KYC verified",      bg: "#dcfce7", text: "#166534", icon: <CheckCircle2 size={12} /> },
  REJECTED:  { label: "KYC rejected",      bg: "#fee2e2", text: "#991b1b", icon: <AlertTriangle size={12} /> },
};

export function KycForm({
  initial,
  kycStatus,
  kycRejectionNote,
}: {
  initial: Values;
  kycStatus: Status;
  kycRejectionNote: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);

  const aadhaarDigits = values.aadhaarNumber.replace(/\D/g, "");
  const aadhaarInvalid =
    values.aadhaarNumber.trim() !== "" && aadhaarDigits.length !== 12;
  const panUpper = values.panNumber.trim().toUpperCase();
  const panInvalid = panUpper !== "" && !/^[A-Z]{5}\d{4}[A-Z]$/.test(panUpper);

  const dirty =
    aadhaarDigits !== initial.aadhaarNumber.replace(/\D/g, "") ||
    panUpper !== initial.panNumber.trim().toUpperCase() ||
    values.photoUrl !== initial.photoUrl ||
    values.aadhaarFrontUrl !== initial.aadhaarFrontUrl ||
    values.aadhaarBackUrl !== initial.aadhaarBackUrl ||
    values.panCardUrl !== initial.panCardUrl;

  const set = <K extends keyof Values>(k: K, v: Values[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (aadhaarInvalid) {
      toast.error("Aadhaar must be 12 digits.");
      return;
    }
    if (panInvalid) {
      toast.error("PAN format must be like ABCDE1234F.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding/kyc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aadhaarNumber: aadhaarDigits || null,
          panNumber: panUpper || null,
          photoUrl: values.photoUrl || null,
          aadhaarFrontUrl: values.aadhaarFrontUrl || null,
          aadhaarBackUrl: values.aadhaarBackUrl || null,
          panCardUrl: values.panCardUrl || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${res.status})`);
        return;
      }
      toast.success("KYC documents updated.");
      router.push("/profile");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const pill = STATUS_PILL[kycStatus] ?? STATUS_PILL.PENDING;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: pill.bg,
            color: pill.text,
            padding: "5px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {pill.icon}
          {pill.label}
        </span>
      </div>

      {kycStatus === "REJECTED" && kycRejectionNote ? (
        <div
          style={{
            padding: 10,
            background: "#fef2f2",
            borderRadius: 8,
            borderLeft: "3px solid #dc2626",
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 800, color: "#dc2626" }}>
            Admin note
          </p>
          <p style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
            {kycRejectionNote}
          </p>
        </div>
      ) : null}

      {kycStatus === "VERIFIED" && (
        <div
          style={{
            padding: "10px 12px",
            background: "#fef3c7",
            borderRadius: 10,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            color: "#92400e",
            fontSize: 12,
          }}
        >
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Your KYC is verified. Changing Aadhaar / PAN / documents will not
            change the status automatically - an admin may re-review the new
            data.
          </span>
        </div>
      )}

      <div>
        <Label className="text-xs">Profile photo</Label>
        <div className="mt-1">
          <ImageUpload
            value={values.photoUrl}
            onChange={(url) => set("photoUrl", url)}
            uploadOnly
          />
        </div>
      </div>

      <div>
        <Label htmlFor="kf-aadhaar" className="text-xs">
          Aadhaar number
        </Label>
        <Input
          id="kf-aadhaar"
          value={values.aadhaarNumber}
          onChange={(e) =>
            set("aadhaarNumber", e.target.value.replace(/\D/g, "").slice(0, 12))
          }
          disabled={busy}
          inputMode="numeric"
          className="mt-1"
          placeholder="12 digits"
        />
        {aadhaarInvalid && (
          <p className="mt-1 text-xs text-destructive">
            Aadhaar must be 12 digits.
          </p>
        )}
      </div>

      <div>
        <Label className="text-xs">Aadhaar front</Label>
        <div className="mt-1">
          <ImageUpload
            value={values.aadhaarFrontUrl}
            onChange={(url) => set("aadhaarFrontUrl", url)}
            uploadOnly
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Aadhaar back</Label>
        <div className="mt-1">
          <ImageUpload
            value={values.aadhaarBackUrl}
            onChange={(url) => set("aadhaarBackUrl", url)}
            uploadOnly
          />
        </div>
      </div>

      <div>
        <Label htmlFor="kf-pan" className="text-xs">
          PAN number
        </Label>
        <Input
          id="kf-pan"
          value={values.panNumber}
          onChange={(e) =>
            set("panNumber", e.target.value.toUpperCase().slice(0, 10))
          }
          disabled={busy}
          className="mt-1"
          placeholder="ABCDE1234F"
        />
        {panInvalid && (
          <p className="mt-1 text-xs text-destructive">
            PAN format must be 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F).
          </p>
        )}
      </div>

      <div>
        <Label className="text-xs">PAN card</Label>
        <div className="mt-1">
          <ImageUpload
            value={values.panCardUrl}
            onChange={(url) => set("panCardUrl", url)}
            uploadOnly
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !dirty || aadhaarInvalid || panInvalid}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
