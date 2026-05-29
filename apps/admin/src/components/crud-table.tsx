"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { toast as sonner } from "sonner";
import { useKycGate } from "@/components/kyc-gated-link";

// English text → URL-safe slug. Lowercase, dashes, alphanumerics only, ≤60 chars.
const slugify = (s: string) =>
  String(s)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 60);

interface Column {
  key: string;
  label: string;
  type?: "text" | "boolean" | "color" | "count" | "date" | "link" | "url";
}

interface CrudTableProps {
  title: string;
  apiPath: string;
  columns: Column[];
  data: any[];
  fields: Field[];
}

interface Field {
  key: string;
  label: string;
  type: "text" | "textarea" | "url" | "select" | "checkbox" | "number" | "date" | "color";
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  // When set, renders a "Translate" button next to the input. Reads the
  // current value of `translateFromKey` (typically the English field) and
  // fills this field with the Telugu translation via /api/ai/rewrite.
  translateFromKey?: string;
  // When set, this field auto-fills with a slugified version of the source
  // key as the user types - until the user manually edits the slug.
  slugFromKey?: string;
}

export function CrudTable({ title, apiPath, columns, data, fields }: CrudTableProps) {
  const router = useRouter();
  // KYC gate. Every shared admin CRUD page (epaper-images, epaper-ads,
  // ads, polls, mandi, categories, desks, …) routes through this
  // component, so gating once here covers all of them. Unverified non-
  // ADMINs get a red sonner toast and the action is suppressed; ADMINs
  // pass through unchanged.
  const { blocked: kycBlocked, kycStatus: gateKycStatus } = useKycGate();
  const fireKycToast = (action: string) => {
    sonner.error(`Your KYC must be verified to ${action}.`, {
      description:
        gateKycStatus === "SUBMITTED"
          ? "Documents are under review - usually verified within 24 hours."
          : gateKycStatus === "REJECTED"
            ? "Your last submission was rejected. Re-upload from the KYC page."
            : "Upload your documents from the KYC page to unlock editorial actions.",
      action: { label: "Complete KYC", onClick: () => router.push("/onboarding/kyc") },
      duration: 8000,
    });
  };
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Toast: fixed top-right banner that auto-dismisses after 3s.
  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  const [translatingKey, setTranslatingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Translate the value of `sourceKey` (English) into Telugu and write it to
  // `targetKey`. Empty source → toast error.
  const translateField = async (targetKey: string, sourceKey: string) => {
    const src = String(formData[sourceKey] || "").trim();
    if (!src) {
      setToast({ msg: "Please enter the English name first", type: "error" });
      return;
    }
    setTranslatingKey(targetKey);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: src, action: "phrase" }),
      });
      const data = await res.json();
      if (!res.ok || !data.result) {
        setToast({ msg: data.error || "Translation failed", type: "error" });
      } else {
        // Trim quotes/whitespace the model occasionally wraps around output.
        const cleaned = String(data.result).trim().replace(/^["']|["']$/g, "");
        setFormData((prev) => ({ ...prev, [targetKey]: cleaned }));
        setToast({ msg: "Translated", type: "success" });
      }
    } catch (e: any) {
      setToast({ msg: e.message || "Translation failed", type: "error" });
    }
    setTranslatingKey(null);
  };

  const openCreate = () => {
    if (kycBlocked) { fireKycToast(`add a new ${title.replace(/s$/, "").toLowerCase()}`); return; }
    setEditId(null);
    setFormData({});
    setShowForm(true);
    setError("");
  };

  const openEdit = (row: any) => {
    if (kycBlocked) { fireKycToast("edit this item"); return; }
    setEditId(row.id);
    setFormData({ ...row });
    setShowForm(true);
    setError("");
  };

  const handleDelete = async (id: string) => {
    if (kycBlocked) { fireKycToast("delete this item"); return; }
    if (!confirm("Are you sure you want to delete this?")) return;
    try {
      const res = await fetch(`/api/${apiPath}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setToast({ msg: data.error || `Delete failed (HTTP ${res.status})`, type: "error" });
        return;
      }
      setToast({ msg: "Deleted", type: "success" });
      router.refresh();
    } catch (e: any) {
      setToast({ msg: e.message || "Delete failed", type: "error" });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const url = editId ? `/api/${apiPath}/${editId}` : `/api/${apiPath}`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }
      setShowForm(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  const updateField = (key: string, value: any) => {
    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      // Cascade: if another field auto-derives its slug from `key`, refresh it.
      // Only refresh when the slug field is empty or still matches the slug
      // we previously derived - preserves manual edits.
      for (const f of fields) {
        if (f.slugFromKey === key) {
          const currentSlug = String(prev[f.key] || "");
          const previousDerived = slugify(String(prev[key] || ""));
          if (!currentSlug || currentSlug === previousDerived) {
            next[f.key] = slugify(String(value || ""));
          }
        }
      }
      return next;
    });
  };

  return (
    <>
      {/* Toast - fixed top-right, auto-dismisses */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 200,
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: toast.type === "error" ? "#dc2626" : "#16a34a",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            maxWidth: 320,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111" }}>{title}</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{data.length} items</p>
        </div>
        <button onClick={openCreate} style={{ padding: "10px 20px", background: "#FF2C2C", color: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>
          + Add New
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div className="table-scroll">
        <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
              {columns.map((col) => (
                <th key={col.key} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, color: "#888", fontWeight: 600 }}>{col.label}</th>
              ))}
              <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, color: "#888", fontWeight: 600 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                {columns.map((col) => {
                  const val = col.key.includes(".") ? col.key.split(".").reduce((o: any, k: string) => o?.[k], row) : row[col.key];
                  return (
                    <td key={col.key} style={{ padding: "10px 16px", fontSize: 13, color: "#333", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {col.type === "boolean" ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: val ? "#dcfce7" : "#fee2e2", color: val ? "#166534" : "#991b1b" }}>
                          {val ? "Active" : "Inactive"}
                        </span>
                      ) : col.type === "color" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 14, height: 14, borderRadius: 3, background: val || "#ccc" }} />
                          <span style={{ fontSize: 11, fontFamily: "monospace" }}>{val}</span>
                        </div>
                      ) : col.type === "count" ? (
                        String(val?.contents ?? val?.articles ?? val?.photos ?? val ?? 0)
                      ) : col.type === "date" ? (
                        val ? new Date(val).toLocaleDateString() : "-"
                      ) : col.type === "link" ? (
                        val ? "Yes" : "-"
                      ) : col.type === "url" ? (
                        // Image columns - render a small thumbnail when the cell
                        // is an image URL (epaper-ads, epaper-images). Falls
                        // back to the URL text if the image fails to load.
                        val ? (
                          <a href={String(val)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={String(val)} alt="" style={{ height: 32, width: "auto", borderRadius: 4, verticalAlign: "middle", background: "#f3f4f6" }} />
                          </a>
                        ) : "-"
                      ) : (
                        String(val ?? "")
                      )}
                    </td>
                  );
                })}
                <td style={{ padding: "10px 16px", textAlign: "right" }}>
                  <button onClick={() => openEdit(row)} style={{ padding: "4px 10px", background: "#eff6ff", color: "#2563eb", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer", marginRight: 6 }}>Edit</button>
                  <button onClick={() => handleDelete(row.id)} style={{ padding: "4px 10px", background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={columns.length + 1} style={{ padding: 40, textAlign: "center", color: "#aaa" }}>No items yet</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 }} onClick={() => setShowForm(false)}>
          <div style={{ background: "#fff", borderRadius: 12, width: "min(520px, 100%)", maxHeight: "85vh", overflow: "auto", padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{editId ? "Edit" : "Create New"} {title.replace(/s$/, "")}</h2>

            {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#dc2626" }}>{error}</div>}

            {fields.map((field) => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 4 }}>
                  {field.label} {field.required && <span style={{ color: "#dc2626" }}>*</span>}
                </label>

                {field.type === "textarea" ? (
                  <textarea
                    value={formData[field.key] || ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box" }}
                  />
                ) : field.type === "select" ? (
                  <select
                    value={formData[field.key] || ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                ) : field.type === "checkbox" ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={formData[field.key] || false} onChange={(e) => updateField(field.key, e.target.checked)} style={{ width: 16, height: 16 }} />
                    <span style={{ fontSize: 13, color: "#555" }}>{field.placeholder || "Enabled"}</span>
                  </label>
                ) : field.type === "color" ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="color" value={formData[field.key] || "#FF2C2C"} onChange={(e) => updateField(field.key, e.target.value)} style={{ width: 40, height: 32, border: "none", cursor: "pointer" }} />
                    <input type="text" value={formData[field.key] || ""} onChange={(e) => updateField(field.key, e.target.value)} style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "monospace", outline: "none", boxSizing: "border-box" }} />
                  </div>
                ) : field.translateFromKey ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={formData[field.key] || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                    />
                    <button
                      type="button"
                      onClick={() => translateField(field.key, field.translateFromKey!)}
                      disabled={translatingKey === field.key}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "0 14px",
                        background: "#FF2C2C",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: translatingKey === field.key ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                        opacity: translatingKey === field.key ? 0.6 : 1,
                      }}
                    >
                      <Languages size={14} />
                      {translatingKey === field.key ? "..." : "Translate"}
                    </button>
                  </div>
                ) : (
                  <input
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
                    value={formData[field.key] || ""}
                    onChange={(e) => updateField(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
                    placeholder={field.placeholder}
                    style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  />
                )}

                {/* Image preview */}
                {field.type === "url" && formData[field.key] && (field.key.includes("image") || field.key.includes("Image") || field.key.includes("thumbnail") || field.key.includes("cover")) && (
                  <img src={formData[field.key]} alt="Preview" style={{ width: "100%", maxHeight: 150, objectFit: "cover", borderRadius: 6, marginTop: 6 }} />
                )}
              </div>
            ))}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "8px 16px", background: "#f3f4f6", color: "#555", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", background: saving ? "#999" : "#FF2C2C", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                {saving ? "Saving..." : editId ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
