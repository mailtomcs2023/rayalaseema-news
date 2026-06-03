"use client";

// Page Builder (Spec #2) - composites list client UI. New / Edit (name +
// description) / Delete. The actual blocks JSON is shaped via the visual
// editor's Group action (F1 #168); creating from here gives you an empty
// composite ready to be filled in.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirm } from "@/components/confirm-dialog";

interface Row {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  blockCount: number;
  createdBy: string;
  updatedAt: string;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function CompositesClient({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [modal, setModal] = useState<Row | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(row: Row) {
    if (
      !(await confirm({
        title: `Delete composite "${row.name}"?`,
        description: "Templates referencing it will render a missing-composite placeholder.",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    const res = await fetch(`/api/page-builder/composites/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Delete failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>Composite Blocks</h1>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            Reusable named groups of blocks (e.g. <i>Election Day Hero</i>). Drop a composite
            into any template and edits propagate.
          </p>
        </div>
        <button onClick={() => setModal("new")} style={btnPrimary}>
          + New Composite
        </button>
      </div>

      {error && <div style={errBox}>{error}</div>}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb", textAlign: "left" }}>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Slug</th>
              <th style={th}>Blocks</th>
              <th style={th}>Created by</th>
              <th style={th}>Last edit</th>
              <th style={{ ...th, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialRows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: "center", color: "#6b7280", padding: 24 }}>
                  No composites yet. Create one here, then fill it in via the visual editor.
                </td>
              </tr>
            )}
            {initialRows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  {r.description && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{r.description}</div>
                  )}
                </td>
                <td style={td}><code style={mono}>{r.slug}</code></td>
                <td style={td}>{r.blockCount}</td>
                <td style={td}>{r.createdBy}</td>
                <td style={td}>{new Date(r.updatedAt).toLocaleString()}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => setModal(r)} style={actionBtn}>Edit</button>
                  <button onClick={() => handleDelete(r)} disabled={busy} style={{ ...actionBtn, color: "#B91C1C" }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <EditModal
          row={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

function EditModal({
  row,
  onClose,
  onSaved,
}: {
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row?.name || "");
  const [slug, setSlug] = useState(row?.slug || "");
  const [description, setDescription] = useState(row?.description || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const url = row ? `/api/page-builder/composites/${row.id}` : `/api/page-builder/composites`;
    const method = row ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        slug: row ? undefined : slug || slugify(name),
        description: description || null,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed");
      return;
    }
    onSaved();
  }

  return (
    <div style={modalBg} onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={modalCard}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 16 }}>
          {row ? "Edit composite" : "New composite"}
        </h2>

        <Label>Name</Label>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!row && !slug) setSlug(slugify(e.target.value));
          }}
          required
          style={inp}
          placeholder="Election Day Hero"
        />

        {!row && (
          <>
            <Label>Slug</Label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} style={inp} placeholder="auto from name" />
          </>
        )}

        <Label>Description (optional)</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...inp, resize: "vertical" }}
        />

        {error && <div style={{ color: "#B91C1C", fontSize: 12, marginTop: 8 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onClose} style={btnSecondary} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" style={btnPrimary} disabled={submitting}>
            {submitting ? "Saving…" : row ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- styles (mirror assignments-client for consistency) ---

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td: React.CSSProperties = { padding: "12px", verticalAlign: "top" };
const mono: React.CSSProperties = {
  background: "#f3f4f6",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: 12,
};
const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  marginBottom: 12,
  outline: "none",
};
const btnPrimary: React.CSSProperties = {
  marginLeft: "auto",
  background: "#FF2C2C",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  background: "#fff",
  color: "#374151",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const actionBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#111827",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  marginRight: 10,
  padding: 0,
};
const errBox: React.CSSProperties = {
  background: "#FEF2F2",
  color: "#B91C1C",
  border: "1px solid #FECACA",
  borderRadius: 6,
  padding: "8px 12px",
  marginBottom: 12,
  fontSize: 13,
};
const modalBg: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};
const modalCard: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 24,
  minWidth: 420,
  maxWidth: 520,
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 6 }}>
      {children}
    </div>
  );
}
