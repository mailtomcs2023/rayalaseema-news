"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "../_components/field";
import { submitProfileChanges, type FieldChange } from "../_components/submit-changes";

type Values = { address: string; city: string; pincode: string; primaryDistrict: string };

export function AddressForm({
  initial,
  pendingByField,
}: {
  initial: Values;
  pendingByField: Record<string, string | null>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);

  const pincodeInvalid =
    values.pincode.trim() !== "" && !/^\d{6}$/.test(values.pincode.trim());
  const dirty = (Object.keys(initial) as (keyof Values)[]).some(
    (k) => values[k].trim() !== initial[k].trim(),
  );

  const change = (k: keyof Values, v: string) =>
    setValues((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (pincodeInvalid) {
      toast.error("Pincode must be 6 digits.");
      return;
    }
    const changes: FieldChange[] = [];
    const trim = (s: string) => s.trim();
    if (trim(values.address) !== trim(initial.address))
      changes.push({ field: "address", value: trim(values.address), label: "Address" });
    if (trim(values.city) !== trim(initial.city))
      changes.push({ field: "city", value: trim(values.city), label: "City" });
    if (trim(values.pincode) !== trim(initial.pincode))
      changes.push({ field: "pincode", value: trim(values.pincode), label: "Pincode" });
    if (trim(values.primaryDistrict) !== trim(initial.primaryDistrict))
      changes.push({
        field: "primaryDistrict",
        value: trim(values.primaryDistrict),
        label: "Primary district",
      });

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
      <Field
        id="ra-address"
        label="Address"
        value={values.address}
        onChange={(v) => change("address", v)}
        disabled={busy}
        multiline
        rows={3}
        maxLength={500}
        placeholder="House / street / area"
        pending={pendingByField.address}
      />
      <Field
        id="ra-city"
        label="City"
        value={values.city}
        onChange={(v) => change("city", v)}
        disabled={busy}
        maxLength={80}
        pending={pendingByField.city}
      />
      <Field
        id="ra-pincode"
        label="Pincode"
        value={values.pincode}
        onChange={(v) => change("pincode", v.replace(/\D/g, "").slice(0, 6))}
        disabled={busy}
        inputMode="numeric"
        placeholder="6-digit pincode"
        pending={pendingByField.pincode}
      />
      {pincodeInvalid && (
        <p className="text-xs text-destructive" style={{ marginTop: -8 }}>
          Pincode must be 6 digits.
        </p>
      )}
      <Field
        id="ra-district"
        label="Primary district"
        value={values.primaryDistrict}
        onChange={(v) => change("primaryDistrict", v)}
        disabled={busy}
        maxLength={60}
        pending={pendingByField.primaryDistrict}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/reporter/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !dirty || pincodeInvalid}>
          {busy ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}
