"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EditorialForm({ initialYears }: { initialYears: number | null }) {
  const router = useRouter();
  const [years, setYears] = useState(initialYears == null ? "" : String(initialYears));
  const [busy, setBusy] = useState(false);

  const trimmed = years.trim();
  const parsed = trimmed === "" ? null : Number(trimmed);
  const invalid =
    parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 80 || !Number.isInteger(parsed));
  const dirty = parsed !== initialYears;

  const save = async () => {
    if (invalid) {
      toast.error("Enter a whole number between 0 and 80.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearsExperience: parsed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Editorial info updated.");
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
        <Label htmlFor="ef-years" className="text-xs">
          Years of experience
        </Label>
        <Input
          id="ef-years"
          type="number"
          min={0}
          max={80}
          step={1}
          value={years}
          onChange={(e) => setYears(e.target.value)}
          disabled={busy}
          className="mt-1"
          placeholder="e.g. 7"
        />
        {invalid && (
          <p className="mt-1 text-xs text-destructive">
            Enter a whole number between 0 and 80.
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || invalid || !dirty}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
