// Menu tree editor (Spec #3 C1-C3 #178-#180 + D1 #181).
// 3-pane shell: palette (4 target type adders), tree, config panel.
// Depth capped at 2 (top item + children). Auto-save draft debounced 5s.
// Publish copies draftItems -> items + snapshots a MenuVersion.
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

type Target =
  | { type: "CATEGORY"; categorySlug: string }
  | { type: "INTERNAL_URL"; url: string }
  | { type: "EXTERNAL_URL"; url: string }
  | { type: "CONTENT"; contentId: string; contentTypeCache?: string; contentSlugCache?: string };

interface Item {
  id: string;
  label: string;
  target: Target;
  mobileVariant: "show" | "hide";
  openInNewTab?: boolean;
  children?: Item[];
}

interface Category { slug: string; name: string; nameEn: string }
interface ContentRow { id: string; type: string; title: string; slug: string | null }

interface Props {
  menuId: string;
  location: string;
  label: string;
  items: Item[];
  publishedItems: Item[];
  isPublished: boolean;
  hasUnpublishedDraft: boolean;
  versionCount: number;
  categories: Category[];
  recentContent: ContentRow[];
}

function genId() {
  return "itm_" + Math.random().toString(36).slice(2, 11);
}

export function MenuTreeEditor(props: Props) {
  const router = useRouter();
  const [tree, setTree] = useState<Item[]>(props.items);
  const [selected, setSelected] = useState<{ topIdx: number; childIdx: number | null } | null>(null);
  const [contentSearch, setContentSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // Debounced auto-save — 5s after the last edit. The status pill in the
  // header reflects the save state.
  const queueSave = useCallback(() => {
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(), 5000);
  }, []);

  const doSave = async () => {
    if (!dirty.current) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/menu-builder/menus/${props.location}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: tree }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Save failed (${res.status})`);
      } else {
        dirty.current = false;
        setSavedAt(new Date());
      }
    } catch (e: any) {
      setError(e.message || "Save failed");
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    await doSave();
    setPublishing(true);
    setError("");
    try {
      const res = await fetch(`/api/menu-builder/menus/${props.location}/publish`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Publish failed (${res.status})`);
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setError(e.message || "Publish failed");
    }
    setPublishing(false);
  };

  useEffect(() => { return () => { if (saveTimer.current) clearTimeout(saveTimer.current); }; }, []);

  // --- mutators ---
  const update = (next: Item[]) => { setTree(next); queueSave(); };

  const addItem = (target: Target, label: string) => {
    update([...tree, { id: genId(), label, target, mobileVariant: "show", children: [] }]);
  };

  const updateItem = (topIdx: number, childIdx: number | null, patch: Partial<Item>) => {
    const next = tree.map((t, i) => {
      if (i !== topIdx) return t;
      if (childIdx === null) return { ...t, ...patch };
      const newChildren = (t.children || []).map((c, j) => (j === childIdx ? { ...c, ...patch } : c));
      return { ...t, children: newChildren };
    });
    update(next);
  };

  const removeItem = (topIdx: number, childIdx: number | null) => {
    const next = tree.flatMap((t, i) => {
      if (i !== topIdx) return [t];
      if (childIdx === null) return [];
      return [{ ...t, children: (t.children || []).filter((_, j) => j !== childIdx) }];
    });
    update(next);
    setSelected(null);
  };

  const moveItem = (topIdx: number, childIdx: number | null, delta: -1 | 1) => {
    if (childIdx === null) {
      const j = topIdx + delta;
      if (j < 0 || j >= tree.length) return;
      const next = [...tree];
      [next[topIdx], next[j]] = [next[j], next[topIdx]];
      update(next);
      setSelected({ topIdx: j, childIdx: null });
    } else {
      const t = tree[topIdx];
      const children = [...(t.children || [])];
      const j = childIdx + delta;
      if (j < 0 || j >= children.length) return;
      [children[childIdx], children[j]] = [children[j], children[childIdx]];
      const next = tree.map((x, i) => (i === topIdx ? { ...x, children } : x));
      update(next);
      setSelected({ topIdx, childIdx: j });
    }
  };

  // Demote a top-level item to a child of the item above (only if the
  // item has no children — depth limit max 2).
  const nest = (topIdx: number) => {
    if (topIdx === 0) return;
    const item = tree[topIdx];
    if (item.children && item.children.length > 0) {
      setError("Item with children can't become a child (max depth 2).");
      setTimeout(() => setError(""), 4000);
      return;
    }
    const parent = tree[topIdx - 1];
    const newParent = { ...parent, children: [...(parent.children || []), { ...item, children: undefined }] };
    const next = tree.filter((_, i) => i !== topIdx).map((t, i) => (i === topIdx - 1 ? newParent : t));
    update(next);
    setSelected({ topIdx: topIdx - 1, childIdx: newParent.children.length - 1 });
  };

  // Promote a child to top level (inserted just after its parent).
  const unnest = (topIdx: number, childIdx: number) => {
    const parent = tree[topIdx];
    const child = parent.children![childIdx];
    const newChildren = parent.children!.filter((_, j) => j !== childIdx);
    const promoted: Item = { ...child, children: [] };
    const next: Item[] = [];
    for (let i = 0; i < tree.length; i++) {
      if (i === topIdx) next.push({ ...parent, children: newChildren });
      else next.push(tree[i]);
      if (i === topIdx) next.push(promoted);
    }
    update(next);
    setSelected({ topIdx: topIdx + 1, childIdx: null });
  };

  // --- selected item lookup ---
  const sel: Item | null = selected
    ? selected.childIdx === null
      ? tree[selected.topIdx]
      : tree[selected.topIdx]?.children?.[selected.childIdx] ?? null
    : null;

  // --- Render ---
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>{props.label}</h1>
          <p style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
            {tree.length} top-level item{tree.length === 1 ? "" : "s"}
            {tree.length > 10 && props.location === "header" && (
              <span style={{ color: "#b45309", marginLeft: 8 }}>
                ⚠ Header has &gt;10 items — may overflow on narrow screens.
              </span>
            )}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : props.hasUnpublishedDraft ? "Unsaved draft" : props.isPublished ? "Published" : "Unpublished"}
        </span>
        <button onClick={doSave} disabled={saving}
          style={{ padding: "8px 14px", background: "#fff", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
          Save Draft
        </button>
        <button onClick={handlePublish} disabled={publishing || saving}
          style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: publishing ? "not-allowed" : "pointer" }}>
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </div>

      {/* Location switcher */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[
          { slug: "header", label: "Header" },
          { slug: "footer", label: "Footer" },
          { slug: "mobile", label: "Mobile" },
        ].map((l) => (
          <a
            key={l.slug}
            href={`/menu-builder/${l.slug}`}
            style={{
              padding: "6px 14px",
              background: props.location === l.slug ? "#111827" : "#fff",
              color: props.location === l.slug ? "#fff" : "#374151",
              border: "1px solid #e5e7eb",
              borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: "none",
            }}
          >{l.label}</a>
        ))}
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#dc2626", marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 320px", gap: 16 }}>
        {/* PALETTE — 4 target type adders */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 10 }}>Add item</h3>

          <Section title="Category">
            <CategoryPicker categories={props.categories} onPick={(c) => addItem({ type: "CATEGORY", categorySlug: c.slug }, c.nameEn)} />
          </Section>

          <Section title="Internal URL">
            <UrlAdder placeholder="/about" prefix="/" onAdd={(url, label) => addItem({ type: "INTERNAL_URL", url }, label)} />
          </Section>

          <Section title="External URL">
            <UrlAdder placeholder="https://…" prefix="https" onAdd={(url, label) => addItem({ type: "EXTERNAL_URL", url }, label)} />
          </Section>

          <Section title="Content">
            <ContentPicker
              rows={props.recentContent}
              search={contentSearch}
              setSearch={setContentSearch}
              onPick={(c) => addItem({
                type: "CONTENT", contentId: c.id,
                contentTypeCache: c.type, contentSlugCache: c.slug || "",
              }, c.title)}
            />
          </Section>
        </div>

        {/* TREE */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          {tree.length === 0 ? (
            <p style={{ fontSize: 13, color: "#888", textAlign: "center", padding: 40 }}>
              No items yet. Add one from the palette.
            </p>
          ) : (
            tree.map((item, ti) => (
              <ItemRow
                key={item.id}
                item={item}
                isTop
                selected={selected?.topIdx === ti && selected.childIdx === null}
                onSelect={() => setSelected({ topIdx: ti, childIdx: null })}
                onUp={() => moveItem(ti, null, -1)}
                onDown={() => moveItem(ti, null, 1)}
                onNest={() => nest(ti)}
                onRemove={() => removeItem(ti, null)}
              >
                {(item.children || []).map((child, ci) => (
                  <ItemRow
                    key={child.id}
                    item={child}
                    isTop={false}
                    selected={selected?.topIdx === ti && selected.childIdx === ci}
                    onSelect={() => setSelected({ topIdx: ti, childIdx: ci })}
                    onUp={() => moveItem(ti, ci, -1)}
                    onDown={() => moveItem(ti, ci, 1)}
                    onUnnest={() => unnest(ti, ci)}
                    onRemove={() => removeItem(ti, ci)}
                  />
                ))}
              </ItemRow>
            ))
          )}
        </div>

        {/* CONFIG PANEL */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          {!sel ? (
            <p style={{ fontSize: 13, color: "#888" }}>Select an item to edit.</p>
          ) : (
            <ItemConfig
              item={sel}
              categories={props.categories}
              recentContent={props.recentContent}
              onChange={(patch) => updateItem(selected!.topIdx, selected!.childIdx, patch)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f3f4f6" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{title}</p>
      {children}
    </div>
  );
}

function CategoryPicker({ categories, onPick }: { categories: Category[]; onPick: (c: Category) => void }) {
  const [v, setV] = useState("");
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select value={v} onChange={(e) => setV(e.target.value)} style={inp}>
        <option value="">— pick —</option>
        {categories.map((c) => <option key={c.slug} value={c.slug}>{c.nameEn}</option>)}
      </select>
      <button onClick={() => { const c = categories.find((x) => x.slug === v); if (c) { onPick(c); setV(""); } }}
        disabled={!v} style={addBtn}>+</button>
    </div>
  );
}

function UrlAdder({ placeholder, prefix: _, onAdd }: { placeholder: string; prefix: string; onAdd: (url: string, label: string) => void }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  return (
    <div>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" style={{ ...inp, marginBottom: 4 }} />
      <div style={{ display: "flex", gap: 6 }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={placeholder} style={inp} />
        <button onClick={() => { if (url && label) { onAdd(url, label); setUrl(""); setLabel(""); } }}
          disabled={!url || !label} style={addBtn}>+</button>
      </div>
    </div>
  );
}

function ContentPicker({ rows, search, setSearch, onPick }: { rows: ContentRow[]; search: string; setSearch: (v: string) => void; onPick: (c: ContentRow) => void }) {
  const filtered = search.trim()
    ? rows.filter((r) => r.title.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];
  return (
    <div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title…" style={inp} />
      {filtered.length > 0 && (
        <div style={{ marginTop: 6, border: "1px solid #e5e7eb", borderRadius: 6, maxHeight: 200, overflowY: "auto" }}>
          {filtered.map((r) => (
            <button key={r.id} onClick={() => { onPick(r); setSearch(""); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 8px", background: "transparent", border: "none", borderBottom: "1px solid #f3f4f6", fontSize: 12, cursor: "pointer" }}>
              <span style={{ fontSize: 9, color: "#6b7280", fontWeight: 700 }}>{r.type}</span>
              <span style={{ marginLeft: 6 }}>{r.title.slice(0, 40)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item, isTop, selected, onSelect, onUp, onDown, onNest, onUnnest, onRemove, children,
}: {
  item: Item; isTop: boolean; selected: boolean;
  onSelect: () => void; onUp: () => void; onDown: () => void;
  onNest?: () => void; onUnnest?: () => void; onRemove: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 10px", borderRadius: 6, marginBottom: 4,
        background: selected ? "#eff6ff" : "transparent",
        marginLeft: isTop ? 0 : 24,
        border: selected ? "1px solid #93c5fd" : "1px solid transparent",
        cursor: "pointer",
      }} onClick={onSelect}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", width: 60 }}>
          {item.target.type.replace("_URL", "").slice(0, 8)}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.label}
        </span>
        {item.mobileVariant === "hide" && <span title="Hidden on mobile" style={{ fontSize: 10, color: "#6b7280" }}>📱⊘</span>}
        <button onClick={(e) => { e.stopPropagation(); onUp(); }} title="Move up" style={tinyBtn}>↑</button>
        <button onClick={(e) => { e.stopPropagation(); onDown(); }} title="Move down" style={tinyBtn}>↓</button>
        {isTop && onNest && (
          <button onClick={(e) => { e.stopPropagation(); onNest!(); }} title="Nest under previous" style={tinyBtn}>→</button>
        )}
        {!isTop && onUnnest && (
          <button onClick={(e) => { e.stopPropagation(); onUnnest!(); }} title="Promote to top" style={tinyBtn}>←</button>
        )}
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove" style={{ ...tinyBtn, color: "#dc2626" }}>✕</button>
      </div>
      {children}
    </div>
  );
}

function ItemConfig({
  item, categories, recentContent, onChange,
}: {
  item: Item; categories: Category[]; recentContent: ContentRow[];
  onChange: (patch: Partial<Item>) => void;
}) {
  return (
    <div>
      <Label>Label</Label>
      <input value={item.label} onChange={(e) => onChange({ label: e.target.value })} style={inp} />

      <Label>Target type</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {(["CATEGORY", "INTERNAL_URL", "EXTERNAL_URL", "CONTENT"] as const).map((t) => (
          <label key={t} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="radio" checked={item.target.type === t} onChange={() => {
              // Switching type resets the type-specific fields.
              if (t === "CATEGORY") onChange({ target: { type: "CATEGORY", categorySlug: "" } });
              else if (t === "INTERNAL_URL") onChange({ target: { type: "INTERNAL_URL", url: "/" } });
              else if (t === "EXTERNAL_URL") onChange({ target: { type: "EXTERNAL_URL", url: "https://" } });
              else onChange({ target: { type: "CONTENT", contentId: "" } });
            }} />
            {t.replace("_", " ")}
          </label>
        ))}
      </div>

      {item.target.type === "CATEGORY" && (
        <>
          <Label>Category</Label>
          <select value={item.target.categorySlug}
            onChange={(e) => onChange({ target: { type: "CATEGORY", categorySlug: e.target.value } })} style={inp}>
            <option value="">— pick —</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.nameEn}</option>)}
          </select>
        </>
      )}

      {item.target.type === "INTERNAL_URL" && (
        <>
          <Label>Internal URL (must start with /)</Label>
          <input value={item.target.url}
            onChange={(e) => onChange({ target: { type: "INTERNAL_URL", url: e.target.value } })}
            placeholder="/about" style={inp} />
        </>
      )}

      {item.target.type === "EXTERNAL_URL" && (
        <>
          <Label>External URL</Label>
          <input type="url" value={item.target.url}
            onChange={(e) => onChange({ target: { type: "EXTERNAL_URL", url: e.target.value } })}
            placeholder="https://…" style={inp} />
        </>
      )}

      {item.target.type === "CONTENT" && (
        <>
          <Label>Content row</Label>
          <select value={item.target.contentId}
            onChange={(e) => {
              const c = recentContent.find((r) => r.id === e.target.value);
              onChange({ target: { type: "CONTENT", contentId: e.target.value, contentTypeCache: c?.type, contentSlugCache: c?.slug || undefined } });
            }} style={inp}>
            <option value="">— pick —</option>
            {recentContent.slice(0, 50).map((r) => (
              <option key={r.id} value={r.id}>[{r.type}] {r.title.slice(0, 40)}</option>
            ))}
          </select>
        </>
      )}

      <Label>Mobile</Label>
      <select value={item.mobileVariant} onChange={(e) => onChange({ mobileVariant: e.target.value as any })} style={inp}>
        <option value="show">Show on mobile</option>
        <option value="hide">Hide on mobile</option>
      </select>

      {item.target.type === "EXTERNAL_URL" && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 13 }}>
          <input type="checkbox" checked={!!item.openInNewTab} onChange={(e) => onChange({ openInNewTab: e.target.checked })} />
          Open in new tab
        </label>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginTop: 10, marginBottom: 4 }}>{children}</label>;
}

const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box" };
const addBtn: React.CSSProperties = { padding: "0 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: "pointer" };
const tinyBtn: React.CSSProperties = { padding: "2px 6px", background: "transparent", border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 11, cursor: "pointer", color: "#374151" };
