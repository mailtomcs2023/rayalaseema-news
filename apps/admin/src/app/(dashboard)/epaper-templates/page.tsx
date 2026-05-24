"use client";

// E-paper template CRUD. Lets DTP staff edit/add page layouts without
// touching code. Each template's `layout` field is JSON — for now we expose
// it as a textarea (operator-friendly JSON). A future iteration adds a
// visual block-builder.

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";

interface Template {
  id: string;
  slug: string;
  name: string;
  type: "FRONT" | "DISTRICT" | "SECTION" | "BACK";
  defaultLabel: string | null;
  fillRules: Record<string, unknown> | null;
  layout: unknown;
  sortOrder: number;
  active: boolean;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/epaper/templates");
      const data = await r.json();
      setTemplates(data || []);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!selected) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      // Validate JSON fields parse before sending
      const layout = typeof selected.layout === "string" ? JSON.parse(selected.layout as string) : selected.layout;
      const fillRules = typeof selected.fillRules === "string"
        ? (selected.fillRules ? JSON.parse(selected.fillRules as string) : null)
        : selected.fillRules;

      const res = await fetch(`/api/epaper/templates/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selected.slug, name: selected.name, type: selected.type,
          defaultLabel: selected.defaultLabel, fillRules, layout,
          sortOrder: selected.sortOrder, active: selected.active,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }
      setSuccess("Saved");
      await load();
      setTimeout(() => setSuccess(""), 2500);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!selected) return;
    if (!confirm(`Delete template "${selected.name}"? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/epaper/templates/${selected.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      setSelected(null);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 16 }}>ePaper Templates</h1>

        <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
          Edit the 13 default e-paper page layouts. Each template's <code>layout</code> is JSON of
          <code> {`{ blocks: [{ id, type, x, y, w, h, slotFilter? }] }`} </code> on a 12-col grid.
          Changes apply to the next <b>Generate</b> on the editor page.
        </p>

        {error && <div style={{ padding: 8, background: "#fee2e2", color: "#991b1b", borderRadius: 6, marginBottom: 8 }}>{error}</div>}
        {success && <div style={{ padding: 8, background: "#dcfce7", color: "#166534", borderRadius: 6, marginBottom: 8 }}>{success}</div>}

        <div style={{ display: "flex", gap: 16 }}>
          {/* List */}
          <aside style={{ width: 300, background: "#fff", borderRadius: 8, padding: 12, maxHeight: "78vh", overflowY: "auto" }}>
            {templates.length === 0 && !busy && (
              <div style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6 }}>No templates yet</p>
                <p style={{ fontSize: 12, marginBottom: 12 }}>Seed the 31 default broadsheet templates with one click:</p>
                <a href="https://github.com/mailtomcs2023/rayalaseema-express/blob/main/packages/db/scripts/seed-epaper-templates.ts" target="_blank" rel="noopener"
                  style={{ fontSize: 11, color: "#4f46e5", textDecoration: "underline" }}>
                  How to seed
                </a>
              </div>
            )}
            {templates.map((t) => (
              <button key={t.id} onClick={() => setSelected(t)}
                style={{
                  width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4,
                  border: "none", borderRadius: 6, cursor: "pointer",
                  background: selected?.id === t.id ? "#4f46e5" : "transparent",
                  color: selected?.id === t.id ? "#fff" : "#111",
                  fontSize: 12,
                }}>
                <div style={{ fontWeight: 700 }}>{t.name}</div>
                <div style={{ opacity: 0.75, fontSize: 10 }}>{t.type} · {t.slug}</div>
              </button>
            ))}
          </aside>

          {/* Editor */}
          <section style={{ flex: 1, background: "#fff", borderRadius: 8, padding: 16 }}>
            {!selected && <p style={{ color: "#888" }}>Pick a template to edit.</p>}
            {selected && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Name">
                    <input value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Slug (immutable in practice — touch with care)">
                    <input value={selected.slug} onChange={(e) => setSelected({ ...selected, slug: e.target.value })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Type">
                    <select value={selected.type} onChange={(e) => setSelected({ ...selected, type: e.target.value as any })}
                      style={inputStyle}>
                      <option>FRONT</option>
                      <option>DISTRICT</option>
                      <option>SECTION</option>
                      <option>BACK</option>
                    </select>
                  </Field>
                  <Field label="Default label (Telugu section header)">
                    <input value={selected.defaultLabel || ""} onChange={(e) => setSelected({ ...selected, defaultLabel: e.target.value })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Sort order">
                    <input type="number" value={selected.sortOrder} onChange={(e) => setSelected({ ...selected, sortOrder: parseInt(e.target.value || "0", 10) })}
                      style={inputStyle} />
                  </Field>
                  <Field label="Active">
                    <input type="checkbox" checked={selected.active} onChange={(e) => setSelected({ ...selected, active: e.target.checked })} />
                  </Field>
                </div>

                <Field label='Fill rules JSON  e.g. { "districtSlug": "kurnool" } or { "categorySlug": "sports" }'>
                  <textarea rows={3}
                    value={selected.fillRules ? JSON.stringify(selected.fillRules, null, 2) : ""}
                    onChange={(e) => setSelected({ ...selected, fillRules: e.target.value as any })}
                    style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} />
                </Field>

                <Field label="Layout JSON  (12-col grid; blocks: lead | major | secondary | brief | image | ad | text | masthead | section-band | story-jump)">
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                    {(["lead", "major", "secondary", "brief", "image", "ad", "text", "masthead", "section-band", "story-jump"] as const).map((bt) => (
                      <button key={bt} type="button"
                        onClick={() => {
                          // Parse current layout, append a new block of this type
                          // with sensible default size + nudged position.
                          let layoutObj: { blocks: any[] };
                          try {
                            layoutObj = typeof selected.layout === "string"
                              ? JSON.parse(selected.layout as string)
                              : (selected.layout as { blocks: any[] }) ?? { blocks: [] };
                          } catch { return; }
                          const blocks = layoutObj.blocks || [];
                          const defaults: Record<string, { w: number; h: number }> = {
                            lead: { w: 8, h: 12 }, major: { w: 4, h: 6 }, secondary: { w: 3, h: 5 },
                            brief: { w: 6, h: 2 }, image: { w: 4, h: 4 }, ad: { w: 12, h: 3 },
                            text: { w: 6, h: 2 }, masthead: { w: 12, h: 3 }, "section-band": { w: 12, h: 2 },
                            "story-jump": { w: 4, h: 1 },
                          };
                          const d = defaults[bt] || { w: 4, h: 4 };
                          const maxY = blocks.reduce((m, b) => Math.max(m, b.y + b.h), 0);
                          const newBlock = {
                            id: `${bt}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                            type: bt, x: 0, y: maxY, w: d.w, h: d.h,
                          };
                          const next = { ...layoutObj, blocks: [...blocks, newBlock] };
                          setSelected({ ...selected, layout: next as any });
                        }}
                        style={{ padding: "4px 10px", background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        + {bt}
                      </button>
                    ))}
                  </div>
                  <textarea rows={22}
                    value={typeof selected.layout === "string" ? selected.layout : JSON.stringify(selected.layout, null, 2)}
                    onChange={(e) => setSelected({ ...selected, layout: e.target.value as any })}
                    style={{ ...inputStyle, fontFamily: "monospace", fontSize: 11 }} />
                  <p style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
                    Tip: use the "+ &lt;type&gt;" buttons to append a block at the bottom of the page.
                    Fine-tune position + size in the /epaper editor where RGL gives drag-resize.
                  </p>
                </Field>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={save} disabled={busy}
                    style={{ padding: "10px 20px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Save
                  </button>
                  <button onClick={remove} disabled={busy}
                    style={{ padding: "10px 20px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
