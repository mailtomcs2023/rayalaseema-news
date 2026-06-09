"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  id: string;
  name: string;
  slug: string;
  isPublished: boolean;
  updatedAt: string;
}

export function VisualPagesManager({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setCreating(true);
    setError(null);
    const res = await fetch("/api/page-builder/visual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() || "Untitled page" }),
    });
    setCreating(false);
    if (res.ok) {
      const p = await res.json();
      router.push(`/page-builder/visual/${p.id}`);
    } else {
      setError((await res.json().catch(() => ({}))).error || "Create failed");
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 4 }}>Visual Pages</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        Free-form pages built with the visual (GrapesJS) editor. Published pages render at <code>/page/&lt;slug&gt;</code>.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, maxWidth: 520 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }}
          placeholder="New page name"
          style={{ flex: 1, padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none" }}
        />
        <button onClick={create} disabled={creating} style={{ background: "#FF2C2C", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: creating ? "not-allowed" : "pointer", opacity: creating ? 0.6 : 1 }}>
          {creating ? "Creating…" : "+ New page"}
        </button>
      </div>
      {error && <div style={{ color: "#B91C1C", fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, marginTop: 12 }}>
        {initial.length === 0 ? (
          <div style={{ padding: 24, color: "#9ca3af", fontSize: 13 }}>No visual pages yet. Create one above.</div>
        ) : (
          initial.map((p) => (
            <a
              key={p.id}
              href={`/page-builder/visual/${p.id}`}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #f3f4f6", textDecoration: "none", color: "#111" }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>/page/{p.slug}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: p.isPublished ? "#D1FAE5" : "#F3F4F6", color: p.isPublished ? "#065F46" : "#374151" }}>
                {p.isPublished ? "Published" : "Draft"}
              </span>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
