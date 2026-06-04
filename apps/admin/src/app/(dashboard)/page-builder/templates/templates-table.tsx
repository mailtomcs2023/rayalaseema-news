"use client";

// Page Builder (Spec #2) - templates list table client component.
// Owns Create (+ Clone from existing), Delete dialogs. Edit is a link to
// /page-builder/templates/[id] (visual editor, E1+).

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { confirm } from "@/components/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Radix Select forbids an empty-string item value, so the "start blank"
// option uses this sentinel and maps back to "" in state.
const BLANK = "__blank__";

interface Row {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  hasDraft: boolean;
  versionCount: number;
  patterns: string[];
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

export function TemplatesTable({ initialRows }: { initialRows: Row[] }) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(row: Row) {
    if (
      !(await confirm({
        title: `Delete template "${row.name}"?`,
        description: "This also removes its assignments and version history.",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    const res = await fetch(`/api/page-builder/templates/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Delete failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0 }}>Templates</h1>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            Named layouts of stacked blocks. Edit on the visual canvas; publish promotes the draft live.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            marginLeft: "auto",
            background: "#FF2C2C",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + New Template
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "#FEF2F2",
            color: "#B91C1C",
            border: "1px solid #FECACA",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ background: "#f9fafb", textAlign: "left" }}>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Slug</th>
              <th style={th}>Status</th>
              <th style={th}>Assigned URLs</th>
              <th style={th}>Versions</th>
              <th style={th}>Last edit</th>
              <th style={{ ...th, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {initialRows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...td, textAlign: "center", color: "#6b7280", padding: 24 }}>
                  No templates yet. Click <b>+ New Template</b> to create one.
                </td>
              </tr>
            )}
            {initialRows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={td}>
                  <Link
                    href={`/page-builder/templates/${r.id}`}
                    style={{ color: "#111827", fontWeight: 600, textDecoration: "none" }}
                  >
                    {r.name}
                  </Link>
                  {r.description && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{r.description}</div>
                  )}
                </td>
                <td style={td}>
                  <code style={{ fontSize: 12, color: "#6b7280" }}>{r.slug}</code>
                </td>
                <td style={td}>
                  {r.isPublished ? (
                    <span style={badgeGreen}>Published</span>
                  ) : (
                    <span style={badgeGray}>Draft</span>
                  )}
                  {r.hasDraft && r.isPublished && (
                    <span style={{ ...badgeOrange, marginLeft: 6 }}>Unpublished edits</span>
                  )}
                </td>
                <td style={td}>
                  {r.patterns.length === 0 ? (
                    <span style={{ color: "#9ca3af" }}>-</span>
                  ) : (
                    r.patterns.map((p) => (
                      <code
                        key={p}
                        style={{
                          display: "inline-block",
                          background: "#f3f4f6",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          marginRight: 4,
                        }}
                      >
                        {p}
                      </code>
                    ))
                  )}
                </td>
                <td style={td}>{r.versionCount}</td>
                <td style={td}>{new Date(r.updatedAt).toLocaleString()}</td>
                <td style={{ ...td, textAlign: "right" }}>
                  <Link href={`/page-builder/templates/${r.id}`} style={actionLink}>Edit</Link>
                  <button
                    onClick={() => {
                      setShowCreate(true);
                      setTimeout(() => {
                        const el = document.querySelector<HTMLSelectElement>("[data-clone-select]");
                        if (el) el.value = r.id;
                      }, 0);
                    }}
                    style={actionBtn}
                  >
                    Clone
                  </button>
                  <button onClick={() => handleDelete(r)} disabled={busy} style={{ ...actionBtn, color: "#B91C1C" }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateModal
          existing={initialRows}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            startTransition(() => router.push(`/page-builder/templates/${id}`));
          }}
        />
      )}
    </div>
  );
}

function CreateModal({
  existing,
  onClose,
  onCreated,
}: {
  existing: Row[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Auto-fill the slug from the name AS THE USER TYPES, until they edit the
  // slug field by hand. The old `if (!slug)` guard only fired on the first
  // keystroke (slug became non-empty after one char, then froze), so the slug
  // never tracked the full name.
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [cloneFromId, setCloneFromId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/page-builder/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        // Normalise whatever's in the field (or derive from name) so the
        // saved slug is always valid even if the user typed spaces/caps.
        slug: slugify(slug || name),
        description: description || null,
        cloneFromId: cloneFromId || undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Create failed");
      return;
    }
    const t = await res.json();
    onCreated(t.id);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 10,
          padding: 24,
          minWidth: 420,
          maxWidth: 520,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 16 }}>New Template</h2>

        <Label>Name</Label>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          required
          style={inp}
          placeholder="Election Day Hero"
        />

        <Label>Slug</Label>
        <input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugEdited(true);
          }}
          style={inp}
          placeholder="auto from name"
        />

        <Label>Description (optional)</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...inp, resize: "vertical" }}
        />

        <Label>Clone from existing (optional)</Label>
        <div style={{ marginBottom: 12 }}>
          <Select
            value={cloneFromId || BLANK}
            onValueChange={(v) => setCloneFromId(v === BLANK ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BLANK}>- Start blank -</SelectItem>
              {existing.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name} ({r.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <div style={{ color: "#B91C1C", fontSize: 12, marginTop: 8 }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onClose} style={btnSecondary} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" style={btnPrimary} disabled={submitting}>
            {submitting ? "Creating…" : "Create"}
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
const td: React.CSSProperties = { padding: "12px", verticalAlign: "top" };
const badgeGreen: React.CSSProperties = {
  background: "#D1FAE5",
  color: "#065F46",
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
};
const badgeGray: React.CSSProperties = {
  background: "#F3F4F6",
  color: "#374151",
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
};
const badgeOrange: React.CSSProperties = {
  background: "#FEF3C7",
  color: "#92400E",
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
};
const actionLink: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#FF2C2C",
  textDecoration: "none",
  marginRight: 10,
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4, marginTop: 6 }}>
      {children}
    </div>
  );
}
