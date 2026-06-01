"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "../_components/field";
import { submitProfileChanges } from "../_components/submit-changes";

export function PhoneForm({
  initialPhone,
  pendingPhone,
}: {
  initialPhone: string;
  pendingPhone: string | null;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);

  const digits = phone.replace(/\D/g, "");
  // Server validator enforces the 10-digit Indian mobile pattern (^[6-9]\d{9}$),
  // so mirror that client-side for an instant cue rather than waiting for a
  // 400 round-trip.
  const invalid = phone.trim() !== "" && !/^[6-9]\d{9}$/.test(digits);
  const dirty = digits !== initialPhone.replace(/\D/g, "");

  const save = async () => {
    if (invalid) {
      toast.error("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!dirty) return;
    setBusy(true);
    const result = await submitProfileChanges([
      { field: "phone", value: digits, label: "Phone" },
    ]);
    setBusy(false);
    if (result.ok) {
      router.push("/reporter/profile");
      router.refresh();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field
        id="rp-phone"
        label="Phone number"
        value={phone}
        onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
        disabled={busy}
        inputMode="tel"
        placeholder="10-digit mobile"
        pending={pendingPhone}
      />
      {invalid && (
        <p className="text-xs text-destructive" style={{ marginTop: -8 }}>
          Enter a valid 10-digit Indian mobile number (starts with 6/7/8/9).
        </p>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/reporter/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !dirty || invalid}>
          {busy ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}
