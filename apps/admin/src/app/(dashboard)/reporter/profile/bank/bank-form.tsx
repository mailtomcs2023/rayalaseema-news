"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "../_components/field";
import { submitProfileChanges, type FieldChange } from "../_components/submit-changes";

type Values = {
  upiId: string;
  bankName: string;
  bankAccount: string;
  bankIfsc: string;
  bankBranch: string;
};

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[\w.\-]{2,}@[\w.\-]{2,}$/;

export function BankForm({
  initial,
  pendingByField,
}: {
  initial: Values;
  pendingByField: Record<string, string | null>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);

  const ifscUpper = values.bankIfsc.trim().toUpperCase();
  const ifscInvalid = ifscUpper !== "" && !IFSC_RE.test(ifscUpper);
  const upiTrim = values.upiId.trim();
  const upiInvalid = upiTrim !== "" && !UPI_RE.test(upiTrim);
  const acctDigits = values.bankAccount.replace(/\D/g, "");
  const acctInvalid =
    values.bankAccount.trim() !== "" && (acctDigits.length < 9 || acctDigits.length > 18);

  const dirty = (Object.keys(initial) as (keyof Values)[]).some(
    (k) => values[k].trim() !== initial[k].trim(),
  );

  const change = (k: keyof Values, v: string) =>
    setValues((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (upiInvalid) return toast.error("UPI ID format must be like name@bank.");
    if (ifscInvalid) return toast.error("IFSC must be 4 letters + 0 + 6 chars (e.g. SBIN0001234).");
    if (acctInvalid) return toast.error("Account number must be 9–18 digits.");

    const changes: FieldChange[] = [];
    if (values.upiId.trim() !== initial.upiId.trim())
      changes.push({ field: "upiId", value: upiTrim, label: "UPI ID" });
    if (values.bankName.trim() !== initial.bankName.trim())
      changes.push({ field: "bankName", value: values.bankName.trim(), label: "Bank name" });
    if (acctDigits !== initial.bankAccount.replace(/\D/g, ""))
      changes.push({ field: "bankAccount", value: acctDigits, label: "Account number" });
    if (ifscUpper !== initial.bankIfsc.trim().toUpperCase())
      changes.push({ field: "bankIfsc", value: ifscUpper, label: "IFSC" });
    if (values.bankBranch.trim() !== initial.bankBranch.trim())
      changes.push({ field: "bankBranch", value: values.bankBranch.trim(), label: "Branch" });

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
          Bank edits pause your next payout until an admin verifies the new
          details. Double-check the account number and IFSC before submitting.
        </span>
      </div>

      <Field
        id="rb-upi"
        label="UPI ID"
        value={values.upiId}
        onChange={(v) => change("upiId", v)}
        disabled={busy}
        placeholder="e.g. yourname@okhdfc"
        pending={pendingByField.upiId}
      />
      {upiInvalid && (
        <p className="text-xs text-destructive" style={{ marginTop: -8 }}>
          UPI ID format must be like name@bank.
        </p>
      )}

      <Field
        id="rb-bankName"
        label="Bank name"
        value={values.bankName}
        onChange={(v) => change("bankName", v)}
        disabled={busy}
        maxLength={80}
        placeholder="e.g. HDFC Bank"
        pending={pendingByField.bankName}
      />

      <Field
        id="rb-account"
        label="Account number"
        value={values.bankAccount}
        onChange={(v) => change("bankAccount", v.replace(/\D/g, "").slice(0, 18))}
        disabled={busy}
        inputMode="numeric"
        placeholder="9–18 digits"
        pending={pendingByField.bankAccount}
      />
      {acctInvalid && (
        <p className="text-xs text-destructive" style={{ marginTop: -8 }}>
          Account number must be 9–18 digits.
        </p>
      )}

      <Field
        id="rb-ifsc"
        label="IFSC code"
        value={values.bankIfsc}
        onChange={(v) => change("bankIfsc", v.toUpperCase().slice(0, 11))}
        disabled={busy}
        placeholder="SBIN0001234"
        pending={pendingByField.bankIfsc}
      />
      {ifscInvalid && (
        <p className="text-xs text-destructive" style={{ marginTop: -8 }}>
          IFSC must be 4 letters + 0 + 6 chars (e.g. SBIN0001234).
        </p>
      )}

      <Field
        id="rb-branch"
        label="Branch"
        value={values.bankBranch}
        onChange={(v) => change("bankBranch", v)}
        disabled={busy}
        maxLength={80}
        pending={pendingByField.bankBranch}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/reporter/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={busy || !dirty || upiInvalid || ifscInvalid || acctInvalid}
        >
          {busy ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}
