"use client";

import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Single labelled input row used by every /reporter/profile/<section> form.
// If a PENDING request exists for the field, surfaces a small "Pending
// admin review: <value>" hint underneath so the reporter knows their
// previous edit is already in flight and the current visible value is the
// admin-approved one.

export function Field({
  id,
  label,
  value,
  onChange,
  disabled,
  type = "text",
  placeholder,
  pending,
  multiline,
  rows = 3,
  maxLength,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  pending?: string | null;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  inputMode?: "text" | "tel" | "numeric" | "decimal" | "email";
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          className="mt-1"
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength}
          inputMode={inputMode}
          className="mt-1"
        />
      )}
      {pending ? (
        <p
          style={{
            marginTop: 4,
            fontSize: 11,
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Clock size={11} />
          Pending admin review: <span style={{ fontWeight: 600 }}>{pending}</span>
        </p>
      ) : null}
    </div>
  );
}
