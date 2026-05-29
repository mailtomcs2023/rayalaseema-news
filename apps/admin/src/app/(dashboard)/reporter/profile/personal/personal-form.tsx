"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "../_components/field";
import { submitProfileChanges, type FieldChange } from "../_components/submit-changes";

type Values = {
  fatherName: string;
  gender: string;
  dateOfBirth: string;
  specialization: string;
};

export function PersonalForm({
  initial,
  pendingByField,
}: {
  initial: Values;
  pendingByField: Record<string, string | null>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);

  const dirty = (Object.keys(initial) as (keyof Values)[]).some(
    (k) => values[k].trim() !== initial[k].trim(),
  );

  const change = (k: keyof Values, v: string) =>
    setValues((s) => ({ ...s, [k]: v }));

  const save = async () => {
    const changes: FieldChange[] = [];
    if (values.fatherName.trim() !== initial.fatherName.trim())
      changes.push({ field: "fatherName", value: values.fatherName.trim(), label: "Father's name" });
    if (values.gender.trim() !== initial.gender.trim())
      changes.push({ field: "gender", value: values.gender.trim(), label: "Gender" });
    if (values.dateOfBirth.trim() !== initial.dateOfBirth.trim())
      changes.push({
        field: "dateOfBirth",
        value: values.dateOfBirth.trim() ? new Date(values.dateOfBirth).toISOString() : "",
        label: "Date of birth",
      });
    if (values.specialization.trim() !== initial.specialization.trim())
      changes.push({ field: "specialization", value: values.specialization.trim(), label: "Specialization" });

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
        id="rp-fatherName"
        label="Father's name"
        value={values.fatherName}
        onChange={(v) => change("fatherName", v)}
        disabled={busy}
        pending={pendingByField.fatherName}
      />
      <Field
        id="rp-gender"
        label="Gender"
        value={values.gender}
        onChange={(v) => change("gender", v)}
        disabled={busy}
        placeholder="e.g. Male / Female / Other"
        pending={pendingByField.gender}
      />
      <Field
        id="rp-dob"
        label="Date of birth"
        type="date"
        value={values.dateOfBirth}
        onChange={(v) => change("dateOfBirth", v)}
        disabled={busy}
        pending={pendingByField.dateOfBirth}
      />
      <Field
        id="rp-specialization"
        label="Specialization"
        value={values.specialization}
        onChange={(v) => change("specialization", v)}
        disabled={busy}
        placeholder="e.g. Politics, Sports, Crime"
        pending={pendingByField.specialization}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/reporter/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !dirty}>
          {busy ? "Submitting…" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}

