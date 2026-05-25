"use client";

// Page Builder (Spec #2) — visual editor 3-pane shell.
//
//   Header   : [← Back] [name + slug] [Status]  [Mobile|Desktop] [Save] [Publish]
//   Palette  : list of built-in block types + composite blocks (drag source — E2)
//   Canvas   : iframe → /page-builder/preview/[id]?draft=1 (web origin)
//   Config   : per-block-type form (E4) when a block is selected
//
// Layout state lives in this component; mutations go through API + iframe
// reloads its src on each save. E2-E5 layer on drag/drop, postMessage,
// config forms, mobile variant + auto-save.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";

interface Initial {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  versionCount: number;
  layout: object;
  draftLayout: object | null;
}

interface CompositeOpt {
  id: string;
  name: string;
  slug: string;
}

interface Layout {
  version: 1;
  blocks: Block[];
}

interface Block {
  id: string;
  type: string;
  config?: Record<string, unknown>;
  compositeId?: string;
  mobileVariant: "show" | "hide" | "stack-below" | "compact";
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_CONFIG: Record<string, Record<string, unknown>> = {
  ReturnVisitBanner: {},
  AdHeaderLeaderboard: { position: "HEADER_LEADERBOARD" },
  AboveFold: { districtCount: 6, latestCount: 10, excludeCategories: [] },
  AdBannerMid: { position: "BANNER_MID" },
  SectionBand: {
    brand: "Section",
    brandHref: "/",
    categorySlug: "",
    tabs: [],
    leadCount: 1,
    gridCount: 4,
    trendingCount: 6,
    showCartoon: false,
    showScores: false,
  },
  CinemaBand: { leadCount: 1, gridCount: 4, reviewsCount: 4, includeMovieReviews: true },
  VideoSection: { count: 6, featuredOnly: false },
  CategoryPair: {
    columns: [
      { title: "Column 1", slug: "", leadCount: 1, itemsCount: 4 },
      { title: "Column 2", slug: "", leadCount: 1, itemsCount: 4 },
    ],
  },
  WebStories: { count: 8 },
  PhotoGallery: { count: 6 },
  AdLeaderboard: { position: "LEADERBOARD" },
  AdInFeedBanner: { position: "IN_FEED" },
};

export function EditorShell({
  initial,
  webUrl,
  builtinBlockTypes,
  composites,
}: {
  initial: Initial;
  webUrl: string;
  builtinBlockTypes: string[];
  composites: CompositeOpt[];
}) {
  const [layout, setLayout] = useState<Layout>(() => {
    const src = (initial.draftLayout || initial.layout) as Layout;
    return src && Array.isArray(src.blocks) ? src : { version: 1, blocks: [] };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeNonce = useRef(0);

  const previewSrc = `${webUrl}/page-builder/preview/${initial.id}?draft=1&_n=${iframeNonce.current}`;

  // Reload the iframe whenever the draft changes (E3+ will replace this
  // with surgical postMessage updates — for E1 the full reload keeps the
  // canvas in sync without protocol work).
  const refreshPreview = useCallback(() => {
    if (!iframeRef.current) return;
    iframeNonce.current += 1;
    iframeRef.current.src = `${webUrl}/page-builder/preview/${initial.id}?draft=1&_n=${iframeNonce.current}`;
  }, [initial.id, webUrl]);

  // Listen for select messages from the iframe (set by the preview page).
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data as { type?: string; blockId?: string } | undefined;
      if (!data || typeof data !== "object") return;
      if (data.type === "page-builder:select" && data.blockId) {
        setSelectedId(data.blockId);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const selected = useMemo(
    () => layout.blocks.find((b) => b.id === selectedId) || null,
    [layout.blocks, selectedId],
  );

  function persistLocal(next: Layout) {
    setLayout(next);
  }

  function addBlock(type: string, compositeId?: string) {
    const id = makeId(type === "Composite" ? "comp" : type.slice(0, 3).toLowerCase());
    const block: Block =
      type === "Composite"
        ? { id, type, compositeId: compositeId!, mobileVariant: "show" }
        : { id, type, config: { ...(DEFAULT_CONFIG[type] || {}) }, mobileVariant: "show" };
    persistLocal({ ...layout, blocks: [...layout.blocks, block] });
    setSelectedId(id);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = layout.blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const j = idx + dir;
    if (j < 0 || j >= layout.blocks.length) return;
    const next = [...layout.blocks];
    [next[idx], next[j]] = [next[j], next[idx]];
    persistLocal({ ...layout, blocks: next });
  }

  function deleteBlock(id: string) {
    persistLocal({ ...layout, blocks: layout.blocks.filter((b) => b.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  function updateBlock(id: string, patch: Partial<Block>) {
    const next = layout.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
    persistLocal({ ...layout, blocks: next });
  }

  async function saveDraft() {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/page-builder/templates/${initial.id}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftLayout: layout }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed");
      return;
    }
    setSavedAt(new Date());
    refreshPreview();
  }

  async function publish() {
    if (!confirm("Publish the current draft? This snapshots a new version and updates the live site.")) return;
    setError(null);
    setPublishing(true);
    // Make sure we've persisted the latest draft first.
    await fetch(`/api/page-builder/templates/${initial.id}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftLayout: layout }),
    });
    const res = await fetch(`/api/page-builder/templates/${initial.id}/publish`, { method: "POST" });
    setPublishing(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Publish failed");
      return;
    }
    setSavedAt(new Date());
    refreshPreview();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 32px)" }}>
      {/* Header */}
      <div style={headerBar}>
        <Link href="/page-builder/templates" style={backLink}>← Back</Link>
        <div style={{ marginLeft: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{initial.name}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{initial.slug}</div>
        </div>
        <span
          style={{
            ...badgeBase,
            background: initial.isPublished ? "#D1FAE5" : "#F3F4F6",
            color: initial.isPublished ? "#065F46" : "#374151",
            marginLeft: 10,
          }}
        >
          {initial.isPublished ? "Published" : "Draft"}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={deviceTabs}>
            <button
              onClick={() => setDevice("desktop")}
              style={{ ...deviceTab, ...(device === "desktop" ? deviceTabActive : {}) }}
            >
              Desktop
            </button>
            <button
              onClick={() => setDevice("mobile")}
              style={{ ...deviceTab, ...(device === "mobile" ? deviceTabActive : {}) }}
            >
              Mobile
            </button>
          </div>
          <Link
            href={`/page-builder/templates/${initial.id}/versions`}
            style={btnSecondary}
          >
            History ({initial.versionCount})
          </Link>
          <button onClick={saveDraft} disabled={saving} style={btnSecondary}>
            {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "Save Draft"}
          </button>
          <button onClick={publish} disabled={publishing} style={btnPrimary}>
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {/* 3-pane body */}
      <div style={{ display: "flex", flex: 1, gap: 0, minHeight: 0 }}>
        {/* Palette */}
        <aside style={paneLeft}>
          <PaletteSection title="Built-in blocks">
            {builtinBlockTypes.map((t) => (
              <PaletteItem key={t} label={t} onClick={() => addBlock(t)} />
            ))}
          </PaletteSection>
          <PaletteSection title="Composite blocks">
            {composites.length === 0 ? (
              <div style={paletteHint}>
                None yet. Create some at <code>/page-builder/composites</code>.
              </div>
            ) : (
              composites.map((c) => (
                <PaletteItem key={c.id} label={c.name} onClick={() => addBlock("Composite", c.id)} />
              ))
            )}
          </PaletteSection>
        </aside>

        {/* Canvas */}
        <section style={paneCenter}>
          <BlockList
            blocks={layout.blocks}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            onMove={moveBlock}
            onDelete={deleteBlock}
            composites={composites}
          />
          <iframe
            ref={iframeRef}
            src={previewSrc}
            style={{
              ...canvasFrame,
              width: device === "mobile" ? 414 : "100%",
            }}
            title="Template preview"
          />
        </section>

        {/* Config */}
        <aside style={paneRight}>
          {!selected ? (
            <div style={paletteHint}>Select a block in the canvas (or in the outline above) to edit its config.</div>
          ) : (
            <ConfigPanel
              block={selected}
              composites={composites}
              onChange={(patch) => updateBlock(selected.id, patch)}
              onDelete={() => deleteBlock(selected.id)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// --- Sub-components ---

function PaletteSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={paletteHead}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

function PaletteItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={paletteItem}>
      + {label}
    </button>
  );
}

function BlockList({
  blocks,
  selectedId,
  onSelect,
  onMove,
  onDelete,
  composites,
}: {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
  composites: CompositeOpt[];
}) {
  return (
    <div style={blockListBox}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>
        Outline ({blocks.length} block{blocks.length === 1 ? "" : "s"})
      </div>
      {blocks.length === 0 && (
        <div style={paletteHint}>Drop a block from the palette to start building.</div>
      )}
      {blocks.map((b, i) => {
        const compName =
          b.type === "Composite" ? composites.find((c) => c.id === b.compositeId)?.name : null;
        return (
          <div
            key={b.id}
            onClick={() => onSelect(b.id)}
            style={{
              ...blockRow,
              ...(selectedId === b.id ? blockRowActive : {}),
            }}
          >
            <span style={{ flex: 1, fontWeight: 600 }}>
              {i + 1}. {b.type}
              {compName && <span style={{ color: "#6b7280", fontWeight: 400 }}> · {compName}</span>}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove(b.id, -1);
              }}
              disabled={i === 0}
              style={iconBtn}
              title="Move up"
            >
              ▲
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove(b.id, 1);
              }}
              disabled={i === blocks.length - 1}
              style={iconBtn}
              title="Move down"
            >
              ▼
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(b.id);
              }}
              style={{ ...iconBtn, color: "#B91C1C" }}
              title="Delete"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ConfigPanel({
  block,
  composites,
  onChange,
  onDelete,
}: {
  block: Block;
  composites: CompositeOpt[];
  onChange: (patch: Partial<Block>) => void;
  onDelete: () => void;
}) {
  // E4 (#166) replaces this with per-type forms. For E1 we expose a raw
  // JSON config editor + mobileVariant so the editor is usable end-to-end
  // before the per-type forms land.
  const [json, setJson] = useState(() =>
    block.type === "Composite"
      ? JSON.stringify({ compositeId: block.compositeId }, null, 2)
      : JSON.stringify(block.config || {}, null, 2),
  );

  useEffect(() => {
    setJson(
      block.type === "Composite"
        ? JSON.stringify({ compositeId: block.compositeId }, null, 2)
        : JSON.stringify(block.config || {}, null, 2),
    );
  }, [block.id, block.type, block.compositeId, block.config]);

  function commitJson() {
    try {
      const parsed = JSON.parse(json);
      if (block.type === "Composite") {
        onChange({ compositeId: parsed.compositeId });
      } else {
        onChange({ config: parsed });
      }
    } catch (e) {
      alert("Invalid JSON: " + (e as Error).message);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>
        Selected
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{block.type}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 12 }}>{block.id}</div>

      {block.type === "Composite" && (
        <>
          <Label>Composite</Label>
          <select
            value={block.compositeId || ""}
            onChange={(e) => onChange({ compositeId: e.target.value })}
            style={inp}
          >
            <option value="">— Pick a composite —</option>
            {composites.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </>
      )}

      <Label>Mobile variant</Label>
      <select
        value={block.mobileVariant}
        onChange={(e) => onChange({ mobileVariant: e.target.value as Block["mobileVariant"] })}
        style={inp}
      >
        <option value="show">Show</option>
        <option value="hide">Hide on mobile</option>
        <option value="stack-below">Stack below</option>
        <option value="compact">Compact</option>
      </select>

      {block.type !== "Composite" && (
        <>
          <Label>Config (JSON)</Label>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            onBlur={commitJson}
            rows={10}
            style={{ ...inp, fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12, resize: "vertical" }}
          />
          <button onClick={commitJson} style={btnSecondary}>Apply</button>
        </>
      )}

      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />
      <button onClick={onDelete} style={{ ...btnSecondary, color: "#B91C1C" }}>
        Delete block
      </button>
    </div>
  );
}

// --- styles ---

const headerBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 12px",
  marginBottom: 10,
};
const backLink: React.CSSProperties = {
  color: "#6b7280",
  textDecoration: "none",
  fontSize: 13,
};
const deviceTabs: React.CSSProperties = {
  display: "inline-flex",
  background: "#f3f4f6",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: 2,
};
const deviceTab: React.CSSProperties = {
  background: "transparent",
  color: "#6b7280",
  border: "none",
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 4,
  cursor: "pointer",
  fontWeight: 600,
};
const deviceTabActive: React.CSSProperties = {
  background: "#fff",
  color: "#111827",
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
};
const paneLeft: React.CSSProperties = {
  width: 220,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  overflowY: "auto",
  marginRight: 10,
};
const paneRight: React.CSSProperties = {
  width: 300,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 14,
  overflowY: "auto",
  marginLeft: 10,
};
const paneCenter: React.CSSProperties = {
  flex: 1,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};
const blockListBox: React.CSSProperties = {
  background: "#fafafa",
  border: "1px solid #f3f4f6",
  borderRadius: 6,
  padding: 8,
  marginBottom: 8,
  maxHeight: 240,
  overflowY: "auto",
};
const blockRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 8px",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
  background: "#fff",
  border: "1px solid transparent",
  marginBottom: 4,
};
const blockRowActive: React.CSSProperties = {
  border: "1px solid #FF2C2C",
  background: "#FEF2F2",
};
const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 11,
  color: "#6b7280",
  cursor: "pointer",
  padding: "2px 4px",
};
const canvasFrame: React.CSSProperties = {
  flex: 1,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#fff",
  display: "block",
  alignSelf: "center",
  width: "100%",
};
const paletteHead: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  marginBottom: 6,
  letterSpacing: "0.04em",
};
const paletteItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 12,
  marginBottom: 4,
  cursor: "pointer",
  color: "#111827",
};
const paletteHint: React.CSSProperties = {
  fontSize: 11,
  color: "#9ca3af",
  padding: 8,
};
const inp: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  marginBottom: 10,
  outline: "none",
};
const btnPrimary: React.CSSProperties = {
  background: "#FF2C2C",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  background: "#fff",
  color: "#374151",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
};
const badgeBase: React.CSSProperties = {
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
  marginBottom: 10,
  fontSize: 13,
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 4, marginTop: 8, letterSpacing: "0.04em" }}>
      {children}
    </div>
  );
}
