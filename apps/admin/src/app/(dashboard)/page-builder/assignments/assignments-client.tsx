"use client";

// Page Builder (Spec #2) - assignments client UI. Table, create/edit modal,
// delete, and the live Test URL widget that calls the API resolver.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface TemplateOpt {
  id: string;
  name: string;
  slug: string;
  isPublished: boolean;
}

interface Row {
  id: string;
  templateId: string;
  template: TemplateOpt;
  pattern: string;
  priority: number;
  active: boolean;
  createdAt: string;
}

export function AssignmentsClient({
  initialRows,
  templates,
}: {
  initialRows: Row[];
  templates: TemplateOpt[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(row: Row) {
    if (!confirm(`Remove assignment "${row.pattern}" → ${row.template.name}?`)) return;
    setError(null);
    const res = await fetch(`/api/page-builder/assignments/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Delete failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function toggleActive(row: Row) {
    setError(null);
    const res = await fetch(`/api/page-builder/assignments/${row.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !row.active }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Update failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>Assignments</h1>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            URL-pattern rules that bind a template to a public route. Higher priority wins;
            ties broken by longer (more specific) pattern.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          style={btnPrimary}
          disabled={templates.length === 0}
        >
          + New Assignment
        </button>
      </div>

      <TestUrlWidget />

      {error && (
        <div style={errBox}>{error}</div>
      )}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb", textAlign: "left" }}>
            <tr>
              <th style={th}>Pattern</th>
              <th style={th}>Template</th>
              <th style={th}>Priority</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialRows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...td, textAlign: "center", color: "#6b7280", padding: 24 }}>
                  No assignments yet.
                </td>
              </tr>
            )}
            {initialRows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}><code style={mono}>{r.pattern}</code></td>
                <td style={td}>
                  {r.template.name}
                  {!r.template.isPublished && (
                    <span style={{ ...badgeOrange, marginLeft: 6 }}>Unpublished</span>
                  )}
                </td>
                <td style={td}>{r.priority}</td>
                <td style={td}>
                  <button onClick={() => toggleActive(r)} disabled={busy} style={pillBtn(r.active)}>
                    {r.active ? "Active" : "Disabled"}
                  </button>
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <button onClick={() => setEditing(r)} style={actionBtn}>Edit</button>
                  <button onClick={() => handleDelete(r)} disabled={busy} style={{ ...actionBtn, color: "#B91C1C" }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          templates={templates}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

function TestUrlWidget() {
  const [url, setUrl] = useState("/");
  const [result, setResult] = useState<{ pattern: string; template: { name: string; slug: string }; priority: number } | null>(null);
  const [tested, setTested] = useState(false);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setTested(false);
    const res = await fetch(`/api/page-builder/assignments/test?url=${encodeURIComponent(url)}`);
    setRunning(false);
    if (res.ok) {
      const body = await res.json();
      setResult(body.match);
      setTested(true);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Test URL</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="/category/sports"
          style={{ ...inp, marginBottom: 0, flex: 1 }}
        />
        <button onClick={run} disabled={running} style={btnPrimary}>
          {running ? "Resolving…" : "Resolve"}
        </button>
      </div>
      {tested && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          {result ? (
            <div style={{ color: "#065F46" }}>
              ✓ <b>{result.template.name}</b>{" "}
              <span style={{ color: "#6b7280" }}>
                via <code style={mono}>{result.pattern}</code> (priority {result.priority})
              </span>
            </div>
          ) : (
            <div style={{ color: "#92400E" }}>
              ⚠ No active+published template matches this URL - the public page would render the empty fallback.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditModal({
  templates,
  row,
  onClose,
  onSaved,
}: {
  templates: TemplateOpt[];
  row: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [templateId, setTemplateId] = useState(row?.templateId || templates[0]?.id || "");
  const [pattern, setPattern] = useState(row?.pattern || "");
  const [priority, setPriority] = useState(row?.priority ?? 10);
  const [active, setActive] = useState(row?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const url = row ? `/api/page-builder/assignments/${row.id}` : `/api/page-builder/assignments`;
    const method = row ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId, pattern: pattern.trim(), priority: Number(priority), active }),
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
          {row ? "Edit assignment" : "New assignment"}
        </h2>

        <Label>Template</Label>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required style={inp}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.slug}){t.isPublished ? "" : " - Unpublished"}
            </option>
          ))}
        </select>

        <Label>Pattern</Label>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          required
          placeholder="/category/* or /category/movie-reviews"
          style={inp}
        />
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: -8, marginBottom: 8 }}>
          Use <code>*</code> for a single segment, <code>**</code> for recursive match.
        </div>

        <Label>Priority</Label>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          style={inp}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 8 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>

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

// --- styles ---

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td: React.CSSProperties = { padding: "12px", verticalAlign: "middle" };
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
const badgeOrange: React.CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
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

function pillBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? "#D1FAE5" : "#F3F4F6",
    color: active ? "#065F46" : "#374151",
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
  };
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 6 }}>
      {children}
    </div>
  );
}
