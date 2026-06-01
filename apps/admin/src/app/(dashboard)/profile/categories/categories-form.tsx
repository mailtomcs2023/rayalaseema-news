"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CategoryOption = {
  id: string;
  label: string;
  subLabel?: string;
  color: string;
};

export function CategoriesForm({
  initialIds,
  categories,
}: {
  initialIds: string[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialIds));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.subLabel?.toLowerCase().includes(q) ?? false),
    );
  }, [categories, query]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dirty =
    selected.size !== initialIds.length ||
    initialIds.some((id) => !selected.has(id));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedCategoryIds: Array.from(selected) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || `Save failed (HTTP ${res.status})`);
        return;
      }
      toast.success("Categories updated.");
      router.push("/profile");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ position: "relative" }}>
        <Search
          size={14}
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#9ca3af",
            pointerEvents: "none",
          }}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories"
          disabled={busy}
          style={{ paddingLeft: 30 }}
        />
      </div>

      <p style={{ fontSize: 11, color: "#6b7280" }}>
        {selected.size} selected · {filtered.length} of {categories.length} shown
      </p>

      <div
        style={{
          maxHeight: 380,
          overflowY: "auto",
          border: "1px solid #f3f4f6",
          borderRadius: 10,
        }}
      >
        {filtered.length === 0 ? (
          <p style={{ padding: 16, fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
            No categories match "{query}".
          </p>
        ) : (
          filtered.map((c) => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                disabled={busy}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 12px",
                  background: on ? "#fef2f2" : "transparent",
                  border: "none",
                  borderBottom: "1px solid #f3f4f6",
                  cursor: busy ? "not-allowed" : "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    background: c.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{c.label}</p>
                  {c.subLabel ? (
                    <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{c.subLabel}</p>
                  ) : null}
                </div>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    border: on ? "1.5px solid #FF2C2C" : "1.5px solid #d1d5db",
                    background: on ? "#FF2C2C" : "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {on ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={() => router.push("/profile")} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : `Save (${selected.size})`}
        </Button>
      </div>
    </div>
  );
}
