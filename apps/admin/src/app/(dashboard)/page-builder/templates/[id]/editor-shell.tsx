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

  // Editor ↔ preview iframe bridge (E3 #165).
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data as { type?: string; blockId?: string; ids?: string[] } | undefined;
      if (!data || typeof data !== "object") return;
      if (data.type === "page-builder:select" && data.blockId) {
        setSelectedId(data.blockId);
      }
      // `page-builder:ready` / `page-builder:blocks` are observed but not
      // acted on here — H1 (#171) will use them for a "preview ready"
      // spinner and an orphan-block warning.
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // When the user picks a block in the outline, mirror the highlight in
  // the iframe and scroll the block into view.
  const lastSelectionSent = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId === lastSelectionSent.current) return;
    lastSelectionSent.current = selectedId;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (selectedId) {
      win.postMessage({ type: "page-builder:scroll-to", blockId: selectedId }, "*");
    } else {
      win.postMessage({ type: "page-builder:highlight", blockId: null }, "*");
    }
  }, [selectedId]);

  const selected = useMemo(
    () => layout.blocks.find((b) => b.id === selectedId) || null,
    [layout.blocks, selectedId],
  );

  // Auto-save (E5 #167) — 5 s of layout inactivity ⇒ flush draft to the
  // server. Tracks the last-saved JSON so we don't re-PUT identical
  // payloads (e.g. after a server-driven refresh).
  const layoutRef = useRef<Layout>(layout);
  const lastSavedJson = useRef<string>(JSON.stringify(layout));
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);

  useEffect(() => {
    layoutRef.current = layout;
    const json = JSON.stringify(layout);
    if (json === lastSavedJson.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      const snapshot = JSON.stringify(layoutRef.current);
      if (snapshot === lastSavedJson.current) return;
      setAutoSaving(true);
      const res = await fetch(`/api/page-builder/templates/${initial.id}/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: snapshot ? `{"draftLayout":${snapshot}}` : "{}",
      });
      setAutoSaving(false);
      if (res.ok) {
        lastSavedJson.current = snapshot;
        setSavedAt(new Date());
      } else {
        // Bubble the validation error up to the manual error banner so the
        // operator sees what went wrong (Zod issues from invalid configs).
        setError((await res.json().catch(() => ({}))).error || "Auto-save failed");
      }
    }, 5000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [layout, initial.id]);

  // Warn before navigating away with an unsaved draft.
  useEffect(() => {
    function before(e: BeforeUnloadEvent) {
      if (JSON.stringify(layoutRef.current) === lastSavedJson.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, []);

  function persistLocal(next: Layout) {
    setLayout(next);
  }

  function addBlock(type: string, compositeId?: string, position?: number) {
    const id = makeId(type === "Composite" ? "comp" : type.slice(0, 3).toLowerCase());
    const block: Block =
      type === "Composite"
        ? { id, type, compositeId: compositeId!, mobileVariant: "show" }
        : { id, type, config: { ...(DEFAULT_CONFIG[type] || {}) }, mobileVariant: "show" };
    const next = [...layout.blocks];
    if (position === undefined || position < 0 || position > next.length) {
      next.push(block);
    } else {
      next.splice(position, 0, block);
    }
    persistLocal({ ...layout, blocks: next });
    setSelectedId(id);
  }

  function reorderBlock(fromId: string, toIndex: number) {
    const fromIdx = layout.blocks.findIndex((b) => b.id === fromId);
    if (fromIdx === -1) return;
    const next = [...layout.blocks];
    const [item] = next.splice(fromIdx, 1);
    // toIndex was computed against the pre-removal list; adjust if dragging
    // downward so the visual drop position matches the array slot.
    const adjusted = toIndex > fromIdx ? toIndex - 1 : toIndex;
    next.splice(Math.max(0, Math.min(adjusted, next.length)), 0, item);
    persistLocal({ ...layout, blocks: next });
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
    const snapshot = JSON.stringify(layout);
    const res = await fetch(`/api/page-builder/templates/${initial.id}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: `{"draftLayout":${snapshot}}`,
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed");
      return;
    }
    lastSavedJson.current = snapshot;
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
            {saving
              ? "Saving…"
              : autoSaving
              ? "Auto-saving…"
              : savedAt
              ? `Saved ${savedAt.toLocaleTimeString()}`
              : "Save Draft"}
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
              <PaletteItem
                key={t}
                label={t}
                onClick={() => addBlock(t)}
                dragPayload={{ type: t }}
              />
            ))}
          </PaletteSection>
          <PaletteSection title="Composite blocks">
            {composites.length === 0 ? (
              <div style={paletteHint}>
                None yet. Create some at <code>/page-builder/composites</code>.
              </div>
            ) : (
              composites.map((c) => (
                <PaletteItem
                  key={c.id}
                  label={c.name}
                  onClick={() => addBlock("Composite", c.id)}
                  dragPayload={{ type: "Composite", compositeId: c.id }}
                />
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
            onReorder={reorderBlock}
            onDropNew={(type, compositeId, position) => addBlock(type, compositeId, position)}
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

function PaletteItem({
  label,
  onClick,
  dragPayload,
}: {
  label: string;
  onClick: () => void;
  dragPayload: { type: string; compositeId?: string };
}) {
  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(
          "application/page-builder",
          JSON.stringify({ kind: "new", ...dragPayload }),
        );
      }}
      style={paletteItem}
      title="Click to add at end, or drag onto the outline at the desired position"
    >
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
  onReorder,
  onDropNew,
  composites,
}: {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
  onReorder: (fromId: string, toIndex: number) => void;
  onDropNew: (type: string, compositeId: string | undefined, position: number) => void;
  composites: CompositeOpt[];
}) {
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  function handleDrop(targetIdx: number, ev: React.DragEvent) {
    ev.preventDefault();
    setDropIdx(null);
    const raw = ev.dataTransfer.getData("application/page-builder");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as
        | { kind: "new"; type: string; compositeId?: string }
        | { kind: "move"; id: string };
      if (payload.kind === "new") {
        onDropNew(payload.type, payload.compositeId, targetIdx);
      } else if (payload.kind === "move") {
        onReorder(payload.id, targetIdx);
      }
    } catch {
      /* ignore malformed payloads */
    }
  }

  function dropZoneProps(idx: number): React.HTMLAttributes<HTMLDivElement> {
    return {
      onDragOver: (e) => {
        if (e.dataTransfer.types.includes("application/page-builder")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDropIdx(idx);
        }
      },
      onDragLeave: () => setDropIdx((prev) => (prev === idx ? null : prev)),
      onDrop: (e) => handleDrop(idx, e),
    };
  }

  return (
    <div style={blockListBox}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>
        Outline ({blocks.length} block{blocks.length === 1 ? "" : "s"})
      </div>
      {blocks.length === 0 && (
        <div
          {...dropZoneProps(0)}
          style={{
            ...paletteHint,
            border: dropIdx === 0 ? "2px dashed #FF2C2C" : "2px dashed transparent",
            borderRadius: 4,
            padding: 12,
          }}
        >
          Drop a block from the palette to start building.
        </div>
      )}

      {/* Drop indicator above the first block */}
      {blocks.length > 0 && (
        <div {...dropZoneProps(0)} style={dropZone(dropIdx === 0)} />
      )}

      {blocks.map((b, i) => {
        const compName =
          b.type === "Composite" ? composites.find((c) => c.id === b.compositeId)?.name : null;
        return (
          <div key={b.id}>
            <div
              onClick={() => onSelect(b.id)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(
                  "application/page-builder",
                  JSON.stringify({ kind: "move", id: b.id }),
                );
              }}
              style={{
                ...blockRow,
                ...(selectedId === b.id ? blockRowActive : {}),
              }}
            >
              <span style={{ color: "#9ca3af", cursor: "grab", marginRight: 4 }} title="Drag to reorder">⋮⋮</span>
              <span style={{ flex: 1, fontWeight: 600 }}>
                {i + 1}. {b.type}
                {compName && <span style={{ color: "#6b7280", fontWeight: 400 }}> · {compName}</span>}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onMove(b.id, -1); }}
                disabled={i === 0}
                style={iconBtn}
                title="Move up"
              >▲</button>
              <button
                onClick={(e) => { e.stopPropagation(); onMove(b.id, 1); }}
                disabled={i === blocks.length - 1}
                style={iconBtn}
                title="Move down"
              >▼</button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}
                style={{ ...iconBtn, color: "#B91C1C" }}
                title="Delete"
              >✕</button>
            </div>
            {/* Drop indicator after each block */}
            <div {...dropZoneProps(i + 1)} style={dropZone(dropIdx === i + 1)} />
          </div>
        );
      })}
    </div>
  );
}

function dropZone(active: boolean): React.CSSProperties {
  return {
    height: active ? 14 : 6,
    margin: "1px 0",
    borderRadius: 3,
    background: active ? "#FF2C2C" : "transparent",
    transition: "background 0.1s, height 0.1s",
  };
}

// --- Config panel: per-type forms (E4 #166) ---

const AD_POSITIONS = [
  "HEADER_LEFT",
  "HEADER_RIGHT",
  "HEADER_LEADERBOARD",
  "BANNER_MID",
  "SIDEBAR_SQUARE",
  "SIDEBAR_TALL",
  "LEADERBOARD",
  "IN_FEED",
  "VERTICAL_STRIP",
] as const;

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
  const cfg = (block.config || {}) as Record<string, unknown>;
  const setCfg = (patch: Record<string, unknown>) =>
    onChange({ config: { ...cfg, ...patch } });

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
          <Label>Config</Label>
          <BlockConfigForm block={block} cfg={cfg} setCfg={setCfg} />
        </>
      )}

      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />
      <button onClick={onDelete} style={{ ...btnSecondary, color: "#B91C1C" }}>
        Delete block
      </button>
    </div>
  );
}

function BlockConfigForm({
  block,
  cfg,
  setCfg,
}: {
  block: Block;
  cfg: Record<string, unknown>;
  setCfg: (patch: Record<string, unknown>) => void;
}) {
  switch (block.type) {
    case "ReturnVisitBanner":
      return <div style={paletteHint}>No configuration.</div>;
    case "AdHeaderLeaderboard":
    case "AdBannerMid":
    case "AdLeaderboard":
    case "AdInFeedBanner":
      return (
        <SmallSelect
          label="Position"
          value={(cfg.position as string) || ""}
          onChange={(v) => setCfg({ position: v })}
          options={AD_POSITIONS.map((p) => ({ value: p, label: p }))}
        />
      );
    case "AboveFold":
      return (
        <>
          <SmallNumber label="District count" value={(cfg.districtCount as number) ?? 6} onChange={(v) => setCfg({ districtCount: v })} min={0} max={20} />
          <SmallNumber label="Latest count" value={(cfg.latestCount as number) ?? 10} onChange={(v) => setCfg({ latestCount: v })} min={0} max={50} />
          <SmallText
            label="Exclude categories (comma-separated slugs)"
            value={Array.isArray(cfg.excludeCategories) ? (cfg.excludeCategories as string[]).join(", ") : ""}
            onChange={(v) =>
              setCfg({
                excludeCategories: v.split(",").map((s) => s.trim()).filter(Boolean),
              })
            }
            placeholder="rasi-phalalu, weather"
          />
        </>
      );
    case "VideoSection":
      return (
        <>
          <SmallNumber label="Count" value={(cfg.count as number) ?? 6} onChange={(v) => setCfg({ count: v })} min={0} max={30} />
          <SmallCheckbox label="Featured only" value={Boolean(cfg.featuredOnly)} onChange={(v) => setCfg({ featuredOnly: v })} />
        </>
      );
    case "WebStories":
      return <SmallNumber label="Count" value={(cfg.count as number) ?? 8} onChange={(v) => setCfg({ count: v })} min={0} max={20} />;
    case "PhotoGallery":
      return <SmallNumber label="Count" value={(cfg.count as number) ?? 6} onChange={(v) => setCfg({ count: v })} min={0} max={20} />;
    case "CinemaBand":
      return (
        <>
          <SmallNumber label="Lead count" value={(cfg.leadCount as number) ?? 1} onChange={(v) => setCfg({ leadCount: v })} min={0} max={10} />
          <SmallNumber label="Grid count" value={(cfg.gridCount as number) ?? 4} onChange={(v) => setCfg({ gridCount: v })} min={0} max={20} />
          <SmallNumber label="Reviews count" value={(cfg.reviewsCount as number) ?? 4} onChange={(v) => setCfg({ reviewsCount: v })} min={0} max={20} />
          <SmallCheckbox
            label="Include movie-reviews category"
            value={cfg.includeMovieReviews !== false}
            onChange={(v) => setCfg({ includeMovieReviews: v })}
          />
        </>
      );
    case "SectionBand":
      return (
        <>
          <SmallText label="Brand (Telugu)" value={(cfg.brand as string) || ""} onChange={(v) => setCfg({ brand: v })} placeholder="leave blank ⇒ derived from category" />
          <SmallText label="Brand href" value={(cfg.brandHref as string) || ""} onChange={(v) => setCfg({ brandHref: v })} placeholder="/category/sports" />
          <SmallText label="Category slug" value={(cfg.categorySlug as string) || ""} onChange={(v) => setCfg({ categorySlug: v })} placeholder="sports (blank ⇒ uses page context)" />
          <SmallNumber label="Lead count" value={(cfg.leadCount as number) ?? 1} onChange={(v) => setCfg({ leadCount: v })} min={0} max={10} />
          <SmallNumber label="Grid count" value={(cfg.gridCount as number) ?? 4} onChange={(v) => setCfg({ gridCount: v })} min={0} max={20} />
          <SmallNumber label="Trending count" value={(cfg.trendingCount as number) ?? 6} onChange={(v) => setCfg({ trendingCount: v })} min={0} max={20} />
          <SmallCheckbox label="Show politics cartoon" value={Boolean(cfg.showCartoon)} onChange={(v) => setCfg({ showCartoon: v })} />
          <SmallCheckbox label="Show cricket scores" value={Boolean(cfg.showScores)} onChange={(v) => setCfg({ showScores: v })} />
          <JsonField
            label="Tabs (array of { label, href })"
            value={Array.isArray(cfg.tabs) ? cfg.tabs : []}
            onChange={(v) => setCfg({ tabs: v })}
          />
        </>
      );
    case "CategoryPair":
      return (
        <JsonField
          label="Columns (array of { title, slug, leadCount, itemsCount })"
          value={Array.isArray(cfg.columns) ? cfg.columns : []}
          onChange={(v) => setCfg({ columns: v })}
        />
      );
    default:
      return (
        <JsonField
          label="Config (JSON)"
          value={cfg}
          onChange={(v) => setCfg(v as Record<string, unknown>)}
        />
      );
  }
}

function SmallText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <>
      <Label>{label}</Label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inp} />
    </>
  );
}

function SmallNumber({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <>
      <Label>{label}</Label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        style={inp}
      />
    </>
  );
}

function SmallCheckbox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 8, marginTop: 4 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function SmallSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <>
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inp}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}

function JsonField<T>({
  label,
  value,
  onChange,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
  }, [value]);
  return (
    <>
      <Label>{label}</Label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            onChange(JSON.parse(text));
            setErr(null);
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
        rows={6}
        style={{ ...inp, fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12, resize: "vertical" }}
      />
      {err && <div style={{ color: "#B91C1C", fontSize: 11, marginTop: -8, marginBottom: 8 }}>{err}</div>}
    </>
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
