"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PhoneForm({ initialPhone }: { initialPhone: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);

  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  const invalid = trimmed !== "" && (digits.length < 7 || digits.length > 15);
  const dirty = trimmed !== initialPhone.trim();

  const save = async () => {
    if (invalid) {
      toast.error("Phone must have between 7 and 15 digits.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: trimmed || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Phone updated.");
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
        <Label htmlFor="ph-phone" className="text-xs">
          Phone number
        </Label>
        <Input
          id="ph-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={busy}
          className="mt-1"
          placeholder="e.g. +91 80884 46843"
          maxLength={20}
        />
        {invalid && (
          <p className="mt-1 text-xs text-destructive">
            Phone must have between 7 and 15 digits.
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
