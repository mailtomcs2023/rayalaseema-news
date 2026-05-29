"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "../_components/field";
import { submitProfileChanges, type FieldChange } from "../_components/submit-changes";

type Values = { aadhaarNumber: string; panNumber: string };

export function KycForm({
  initial,
  pendingByField,
  kycStatus,
}: {
  initial: Values;
  pendingByField: Record<string, string | null>;
  kycStatus: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);

  const aadhaarDigits = values.aadhaarNumber.replace(/\D/g, "");
  const aadhaarInvalid =
    values.aadhaarNumber.trim() !== "" && aadhaarDigits.length !== 12;
  const panUpper = values.panNumber.trim().toUpperCase();
  const panInvalid =
    panUpper !== "" && !/^[A-Z]{5}\d{4}[A-Z]$/.test(panUpper);

  const dirty =
    values.aadhaarNumber.trim() !== initial.aadhaarNumber.trim() ||
    values.panNumber.trim() !== initial.panNumber.trim();

  const change = (k: keyof Values, v: string) =>
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
    const changes: FieldChange[] = [];
    if (values.aadhaarNumber.trim() !== initial.aadhaarNumber.trim())
      changes.push({
        field: "aadhaarNumber",
        value: aadhaarDigits,
        label: "Aadhaar",
      });
    if (panUpper !== initial.panNumber.trim().toUpperCase())
      changes.push({ field: "panNumber", value: panUpper, label: "PAN" });

    if (changes.length === 0) return;
    setBusy(true);
    const result = await submitProfileChanges(changes);
    setBusy(false);
    if (result.ok) {
      router.push("/reporter/profile");
      router.refresh();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            Changing Aadhaar or PAN will pause your KYC verification until an
            admin re-verifies. Earnings stay paused during this time.
          </span>
        </div>
      )}

      <Field
        id="rk-aadhaar"
        label="Aadhaar number"
        value={values.aadhaarNumber}
        onChange={(v) => change("aadhaarNumber", v.replace(/\D/g, "").slice(0, 12))}
        disabled={busy}
        inputMode="numeric"
        placeholder="12 digits"
        pending={pendingByField.aadhaarNumber}
      />
      {aadhaarInvalid && (
        <p className="text-xs text-destructive" style={{ marginTop: -8 }}>
          Aadhaar must be 12 digits.
        </p>
      )}

      <Field
        id="rk-pan"
        label="PAN number"
        value={values.panNumber}
        onChange={(v) => change("panNumber", v.toUpperCase().slice(0, 10))}
        disabled={busy}
        placeholder="ABCDE1234F"
        pending={pendingByField.panNumber}
      />
      {panInvalid && (
        <p className="text-xs text-destructive" style={{ marginTop: -8 }}>
          PAN format must be 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F).
        </p>
      )}

      <p style={{ fontSize: 11, color: "#6b7280" }}>
        To upload or replace Aadhaar / PAN photos, open the Rayalaseema Express
        mobile app and tap KYC documents.
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/reporter/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !dirty || aadhaarInvalid || panInvalid}>
          {busy ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}
