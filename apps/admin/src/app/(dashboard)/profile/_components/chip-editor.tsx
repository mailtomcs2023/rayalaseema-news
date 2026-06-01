"use client";

import { useState, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Shared chip editor used by /profile/expertise and /profile/affiliations.
// Comma or Enter adds; Backspace on empty input removes the last chip; X
// button removes a specific chip. De-dupes case-insensitively but preserves
// the case the user typed for display.

export function ChipEditor({
  initial,
  field,
  inputLabel,
  inputPlaceholder,
  maxItems = 40,
  maxLength = 60,
}: {
  initial: string[];
  field: "expertise" | "affiliations";
  inputLabel: string;
  inputPlaceholder: string;
  maxItems?: number;
  maxLength?: number;
}) {
  const router = useRouter();
  const [chips, setChips] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const dirty =
    chips.length !== initial.length ||
    chips.some((c, i) => c !== initial[i]);

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (v.length > maxLength) {
      toast.error(`Max ${maxLength} characters per entry.`);
      return;
    }
    if (chips.length >= maxItems) {
      toast.error(`Max ${maxItems} entries.`);
      return;
    }
    if (chips.some((c) => c.toLowerCase() === v.toLowerCase())) {
      toast.error("Already added.");
      return;
    }
    setChips((cs) => [...cs, v]);
    setDraft("");
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && chips.length > 0) {
      setChips((cs) => cs.slice(0, -1));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: chips }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Saved.");
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
        <Label htmlFor="chip-draft" className="text-xs">
          {inputLabel}
        </Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="chip-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={inputPlaceholder}
            disabled={busy}
            maxLength={maxLength}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => add(draft)}
            disabled={busy || !draft.trim()}
          >
            <Plus size={14} />
            Add
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Press Enter or comma to add. {chips.length} / {maxItems}.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          minHeight: 40,
          padding: chips.length === 0 ? 0 : 0,
        }}
      >
        {chips.length === 0 ? (
          <p style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
            Nothing added yet.
          </p>
        ) : (
          chips.map((c, i) => (
            <span
              key={`${c}-${i}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 4px 4px 10px",
                background: "#f3f4f6",
                color: "#374151",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {c}
              <button
                type="button"
                onClick={() => setChips((cs) => cs.filter((_, j) => j !== i))}
                disabled={busy}
                aria-label={`Remove ${c}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: "transparent",
                  color: "#6b7280",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
