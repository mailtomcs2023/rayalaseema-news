"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const GENDERS = ["Male", "Female", "Other"];
const EXPERIENCE_OPTIONS = [
  "None / Fresher",
  "Less than 1 year",
  "1 - 3 years",
  "3 - 5 years",
  "5 - 10 years",
  "10+ years",
];

type Values = {
  name: string;
  bio: string;
  fatherName: string;
  dateOfBirth: string;
  gender: string;
  // yearsExperience lives on User as Int; surface as a free input.
  yearsExperience: number | null;
  // `experience` on ReporterProfile is the bucketed text the onboarding
  // wizard sets ("1 - 3 years"). Keep the same chip control here.
  experience: string;
  specialization: string;
};

export function PersonalForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Values>(k: K, v: Values[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  const yearsStr = values.yearsExperience == null ? "" : String(values.yearsExperience);
  const yearsParsed = yearsStr.trim() === "" ? null : Number(yearsStr.trim());
  const yearsInvalid =
    yearsParsed !== null &&
    (!Number.isFinite(yearsParsed) ||
      yearsParsed < 0 ||
      yearsParsed > 80 ||
      !Number.isInteger(yearsParsed));

  const trim = (s: string) => s.trim();
  const dirty =
    trim(values.name) !== trim(initial.name) ||
    trim(values.bio) !== trim(initial.bio) ||
    trim(values.fatherName) !== trim(initial.fatherName) ||
    trim(values.dateOfBirth) !== trim(initial.dateOfBirth) ||
    trim(values.gender) !== trim(initial.gender) ||
    (values.yearsExperience ?? null) !== (initial.yearsExperience ?? null) ||
    trim(values.experience) !== trim(initial.experience) ||
    trim(values.specialization) !== trim(initial.specialization);

  const save = async () => {
    if (!trim(values.name)) {
      toast.error("Name can't be empty.");
      return;
    }
    if (yearsInvalid) {
      toast.error("Years of experience must be a whole number between 0 and 80.");
      return;
    }
    setBusy(true);
    try {
      // User-row fields (name, bio, yearsExperience) -> /api/profile.
      const userBody: Record<string, unknown> = {
        name: trim(values.name),
        bio: trim(values.bio) || null,
        yearsExperience: yearsParsed,
      };
      const userRes = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userBody),
      });
      if (!userRes.ok) {
        const d = await userRes.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${userRes.status})`);
        return;
      }

      // ReporterProfile-row fields -> /api/onboarding/kyc PATCH. Same
      // endpoint the wizard uses; it upserts the profile row so first-time
      // staff edits don't need a separate create step.
      const reporterBody: Record<string, unknown> = {
        fatherName: trim(values.fatherName) || null,
        dateOfBirth: trim(values.dateOfBirth) || null,
        gender: trim(values.gender) || null,
        experience: trim(values.experience) || null,
        specialization: trim(values.specialization) || null,
      };
      const repRes = await fetch("/api/onboarding/kyc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reporterBody),
      });
      if (!repRes.ok) {
        const d = await repRes.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${repRes.status})`);
        return;
      }

      toast.success("Personal info updated.");
      router.push("/profile");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Label htmlFor="pf-name" className="text-xs">
          Full name <span style={{ color: "#dc2626" }}>*</span>
        </Label>
        <Input
          id="pf-name"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          disabled={busy}
          className="mt-1"
          maxLength={100}
        />
      </div>

      <div>
        <Label htmlFor="pf-father" className="text-xs">
          Father&apos;s name
        </Label>
        <Input
          id="pf-father"
          value={values.fatherName}
          onChange={(e) => set("fatherName", e.target.value)}
          disabled={busy}
          className="mt-1"
          maxLength={100}
        />
      </div>

      <div>
        <Label className="text-xs">Date of birth</Label>
        <div className="mt-1">
          <DatePicker
            value={values.dateOfBirth}
            onChange={(v) => set("dateOfBirth", v)}
            disabled={busy}
            fromYear={1940}
            toYear={new Date().getFullYear()}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Gender</Label>
        <div className="mt-2" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {GENDERS.map((g) => (
            <Chip
              key={g}
              active={values.gender === g}
              disabled={busy}
              onClick={() => set("gender", values.gender === g ? "" : g)}
            >
              {g}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="pf-years" className="text-xs">
          Years of experience
        </Label>
        <Input
          id="pf-years"
          type="number"
          min={0}
          max={80}
          step={1}
          value={yearsStr}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              set("yearsExperience", null);
              return;
            }
            const n = Number(raw);
            set("yearsExperience", Number.isFinite(n) ? n : null);
          }}
          disabled={busy}
          className="mt-1"
          placeholder="e.g. 7"
        />
        {yearsInvalid && (
          <p className="mt-1 text-xs text-destructive">
            Enter a whole number between 0 and 80.
          </p>
        )}
      </div>

      <div>
        <Label className="text-xs">Media experience bucket</Label>
        <div className="mt-2" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {EXPERIENCE_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              active={values.experience === opt}
              disabled={busy}
              onClick={() =>
                set("experience", values.experience === opt ? "" : opt)
              }
            >
              {opt}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="pf-spec" className="text-xs">
          Specialization
        </Label>
        <Input
          id="pf-spec"
          value={values.specialization}
          onChange={(e) => set("specialization", e.target.value)}
          disabled={busy}
          className="mt-1"
          maxLength={120}
          placeholder="e.g. Politics, Sports, Crime"
        />
      </div>

      <div>
        <Label htmlFor="pf-bio" className="text-xs">
          Bio
        </Label>
        <Textarea
          id="pf-bio"
          value={values.bio}
          onChange={(e) => set("bio", e.target.value)}
          disabled={busy}
          rows={5}
          maxLength={2000}
          placeholder="Short summary that appears on your public author page."
          className="mt-1"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {values.bio.length} / 2000
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !dirty || yearsInvalid}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-[#FF2C2C] bg-[#FF2C2C0F] text-[#FF2C2C]"
          : "border-input bg-background text-foreground hover:bg-muted",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}
