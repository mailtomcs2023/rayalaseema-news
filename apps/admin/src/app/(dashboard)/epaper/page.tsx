"use client";

// v2 e-paper editor with drag-resize via react-grid-layout.
// Pipeline:
//   1. operator picks a date + clicks Generate → /api/epaper/generate-edition
//      auto-fills templates with articles
//   2. left pane shows page tabs
//   3. middle pane shows the chosen page's block grid — drag any block to
//      reorder, drag a corner to resize, click a story block to swap article
//   4. right pane shows article picker filtered by the slot's rules
//   5. lock toggle per block (autofill skips locked blocks on regenerate)
//   6. Render button → /api/epaper/render-v2 builds the vector PDF

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import GridLayout, { type Layout as RGLLayout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";

interface Block {
  id: string;
  type: string;
  x: number; y: number; w: number; h: number;
  articleId?: string | null;
  locked?: boolean;
  slotFilter?: {
    categorySlug?: string;
    districtSlug?: string;
    minImages?: number;
  };
}
interface PageRow {
  id: string;
  pageNumber: number;
  label: string;
  templateSlug: string | null;
  layout: { blocks: Block[] };
  pdfUrl: string | null;
}
interface Edition {
  id: string;
  date: string;
  status: string;
  pdfUrl: string | null;
  pages: PageRow[];
}
interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  featuredImage: string | null;
  category: { name: string; slug: string };
  publishedAt: string | null;
}

const STORY_TYPES = new Set(["lead", "major", "secondary", "brief"]);

export default function EpaperEditorPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [activePageIdx, setActivePageIdx] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  const [pickerArticles, setPickerArticles] = useState<ArticleSummary[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");

  const [titles, setTitles] = useState<Record<string, string>>({});

  const loadEdition = useCallback(async (d: string) => {
    setError(""); setBusy("loading");
    try {
      const res = await fetch(`/api/epaper/edition?date=${d}`);
      if (res.status === 404) { setEdition(null); return; }
      if (!res.ok) throw new Error("Failed to load edition");
      const data = await res.json();
      setEdition(data);
      const allIds = new Set<string>();
      for (const p of data.pages as PageRow[]) {
        for (const b of p.layout?.blocks || []) {
          if (b.articleId) allIds.add(b.articleId);
        }
      }
      if (allIds.size > 0) {
        const r = await fetch(`/api/articles?ids=${[...allIds].join(",")}&limit=500`);
        const list = await r.json();
        const map: Record<string, string> = {};
        for (const a of list.articles || []) map[a.id] = a.title;
        setTitles(map);
      }
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  }, []);

  useEffect(() => { loadEdition(date); }, [date, loadEdition]);

  const generate = async () => {
    setBusy("generating"); setError("");
    try {
      const res = await fetch("/api/epaper/generate-edition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generate failed");
      }
      await loadEdition(date);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const renderEdition = async () => {
    if (!edition) return;
    setBusy("rendering"); setError("");
    try {
      const res = await fetch("/api/epaper/render-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId: edition.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Render failed");
      }
      const data = await res.json();
      await loadEdition(date);
      if (data.pdfUrl) window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const activePage = edition?.pages?.[activePageIdx];

  useEffect(() => {
    if (!selectedBlockId || !activePage) { setPickerArticles([]); return; }
    const block = activePage.layout.blocks.find((b) => b.id === selectedBlockId);
    if (!block) return;
    const params = new URLSearchParams();
    if (block.slotFilter?.categorySlug) params.set("categorySlug", block.slotFilter.categorySlug);
    if (block.slotFilter?.districtSlug) params.set("districtSlug", block.slotFilter.districtSlug);
    if (block.slotFilter?.minImages && block.slotFilter.minImages > 0) params.set("hasImage", "1");
    if (pickerQuery) params.set("q", pickerQuery);
    fetch(`/api/epaper/article-picker?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setPickerArticles(data.articles || []));
  }, [selectedBlockId, pickerQuery, activePage]);

  const setBlockArticle = async (articleId: string | null) => {
    if (!activePage || !selectedBlockId) return;
    await fetch(`/api/epaper/page/${activePage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setArticle: { blockId: selectedBlockId, articleId } }),
    });
    setEdition((prev) => {
      if (!prev) return prev;
      return { ...prev, pages: prev.pages.map((p) => p.id === activePage.id ? {
        ...p, layout: { blocks: p.layout.blocks.map((b) => b.id === selectedBlockId ? { ...b, articleId } : b) },
      } : p) };
    });
    if (articleId) {
      const picked = pickerArticles.find((a) => a.id === articleId);
      if (picked) setTitles((t) => ({ ...t, [articleId]: picked.title }));
    }
  };

  const toggleLock = async (blockId: string) => {
    if (!activePage) return;
    const block = activePage.layout.blocks.find((b) => b.id === blockId);
    if (!block) return;
    const newLocked = !block.locked;
    await fetch(`/api/epaper/page/${activePage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setLocked: { blockId, locked: newLocked } }),
    });
    setEdition((prev) => {
      if (!prev) return prev;
      return { ...prev, pages: prev.pages.map((p) => p.id === activePage.id ? {
        ...p, layout: { blocks: p.layout.blocks.map((b) => b.id === blockId ? { ...b, locked: newLocked } : b) },
      } : p) };
    });
  };

  // Persists the full block-layout when react-grid-layout finishes a drag/resize.
  const saveLayout = async (newBlocks: Block[]) => {
    if (!activePage) return;
    setEdition((prev) => {
      if (!prev) return prev;
      return { ...prev, pages: prev.pages.map((p) =>
        p.id === activePage.id ? { ...p, layout: { blocks: newBlocks } } : p) };
    });
    await fetch(`/api/epaper/page/${activePage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: newBlocks }),
    });
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Top bar */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>ePaper Editor (v2)</h1>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, fontSize: 13 }} />
          <button onClick={generate} disabled={busy === "generating"}
            style={{ padding: "8px 16px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {busy === "generating" ? "Generating…" : edition ? "Regenerate" : "Generate"}
          </button>
          {edition && (
            <button onClick={renderEdition} disabled={busy === "rendering"}
              style={{ padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {busy === "rendering" ? "Rendering…" : "Render PDF"}
            </button>
          )}
          {edition?.pdfUrl && (
            <a href={edition.pdfUrl} target="_blank" rel="noopener noreferrer"
              style={{ padding: "8px 16px", background: "#fff", color: "#4f46e5", border: "1px solid #4f46e5", borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
              Open last PDF ↗
            </a>
          )}
          <span style={{ fontSize: 12, color: "#888" }}>Status: <b>{edition?.status || "—"}</b></span>
          {error && <span style={{ color: "#dc2626", fontSize: 12 }}>{error}</span>}
        </div>

        {!edition && busy === "loading" && <p style={{ color: "#888" }}>Loading…</p>}
        {!edition && busy !== "loading" && (
          <div style={{ padding: 40, textAlign: "center", color: "#666", background: "#fff", borderRadius: 8 }}>
            No edition for {date}. Click <b>Generate</b> to auto-fill 13 pages from today's articles.
          </div>
        )}

        {edition && (
          <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
            {/* Page tabs */}
            <aside style={{ width: 220, background: "#fff", borderRadius: 8, padding: 12, overflowY: "auto" }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#555", marginBottom: 8 }}>PAGES</h3>
              {edition.pages.map((p, i) => (
                <button key={p.id} onClick={() => { setActivePageIdx(i); setSelectedBlockId(null); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4,
                    border: "none", borderRadius: 6, cursor: "pointer",
                    background: i === activePageIdx ? "#4f46e5" : "transparent",
                    color: i === activePageIdx ? "#fff" : "#111",
                    fontSize: 12, fontWeight: 600,
                  }}>
                  {p.pageNumber}. {p.label}
                </button>
              ))}
            </aside>

            {/* Page canvas */}
            <section style={{ flex: 1, background: "#fff", borderRadius: 8, padding: 16, overflow: "auto" }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#555", marginBottom: 10 }}>
                Page {activePage?.pageNumber} · {activePage?.label} · template: <code style={{ fontSize: 11 }}>{activePage?.templateSlug}</code>
              </h3>
              {activePage && (
                <DraggableBlockGrid
                  layout={activePage.layout}
                  titles={titles}
                  selectedBlockId={selectedBlockId}
                  onSelect={setSelectedBlockId}
                  onToggleLock={toggleLock}
                  onLayoutChange={saveLayout}
                />
              )}
            </section>

            {/* Article picker */}
            <aside style={{ width: 300, background: "#fff", borderRadius: 8, padding: 12, overflowY: "auto" }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#555", marginBottom: 8 }}>ARTICLE PICKER</h3>
              {!selectedBlockId && <p style={{ fontSize: 12, color: "#888" }}>Click a story block on the page to pick an article.</p>}
              {selectedBlockId && (
                <>
                  <input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search title…"
                    style={{ width: "100%", padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 12, marginBottom: 8, boxSizing: "border-box" }} />
                  <button onClick={() => setBlockArticle(null)}
                    style={{ width: "100%", padding: "6px 8px", background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, marginBottom: 8, cursor: "pointer" }}>
                    Clear assignment
                  </button>
                  <p style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{pickerArticles.length} candidates</p>
                  {pickerArticles.map((a) => (
                    <button key={a.id} onClick={() => setBlockArticle(a.id)}
                      style={{ width: "100%", textAlign: "left", padding: 8, marginBottom: 4, border: "1px solid #eee", borderRadius: 6, cursor: "pointer", background: "#fafafa", fontSize: 12 }}>
                      <div style={{ fontWeight: 700, lineHeight: 1.3, marginBottom: 2 }}>{a.title.slice(0, 80)}</div>
                      <div style={{ color: "#888", fontSize: 10 }}>{a.category.name}{a.featuredImage ? " · 📷" : ""}</div>
                    </button>
                  ))}
                </>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Drag-resize block grid built on react-grid-layout.
 *  - 12-column grid; row height = 28 px so a 30-row template fits comfortably
 *    in the editor without dwarfing the article picker
 *  - Bigger render than the previous read-only version so operators with
 *    minimal computer skills can actually read the block content
 *  - Drag a block by its body, resize from the bottom-right corner
 *  - Click-to-select for story blocks still works (RGL doesn't swallow click
 *    when the drag never moves past its threshold)
 *  - Static (non-draggable) treatment for masthead/section-band so DTP staff
 *    can't accidentally drag the brand band off the page
 */
function DraggableBlockGrid({
  layout, titles, selectedBlockId, onSelect, onToggleLock, onLayoutChange,
}: {
  layout: { blocks: Block[] };
  titles: Record<string, string>;
  selectedBlockId: string | null;
  onSelect: (id: string) => void;
  onToggleLock: (id: string) => void;
  onLayoutChange: (newBlocks: Block[]) => void;
}) {
  const COLS = 12;
  const ROW_H = 28;
  const GRID_WIDTH = 980;

  // RGL layout items, keyed by block id.
  const rglLayout: RGLLayout[] = layout.blocks.map((b) => ({
    i: b.id,
    x: b.x, y: b.y, w: b.w, h: b.h,
    static: b.type === "masthead" || b.type === "section-band",
    minW: 1, minH: 1,
  }));

  const onChange = (newRGL: RGLLayout[]) => {
    // Merge RGL coords back into our block model. Skip purely visual updates
    // (RGL fires on every render of children) by comparing first.
    const byId = new Map(newRGL.map((it) => [it.i, it]));
    let dirty = false;
    const next: Block[] = layout.blocks.map((b) => {
      const it = byId.get(b.id);
      if (!it) return b;
      if (it.x !== b.x || it.y !== b.y || it.w !== b.w || it.h !== b.h) dirty = true;
      return { ...b, x: it.x, y: it.y, w: it.w, h: it.h };
    });
    if (dirty) onLayoutChange(next);
  };

  return (
    <div style={{ background: "#fafafa", borderRadius: 6, padding: 8 }}>
      <GridLayout
        className="re-epaper-grid"
        layout={rglLayout}
        cols={COLS}
        rowHeight={ROW_H}
        width={GRID_WIDTH}
        margin={[6, 6]}
        compactType={null}
        preventCollision={true}
        onDragStop={onChange}
        onResizeStop={onChange}
        draggableCancel=".lock-btn"
      >
        {layout.blocks.map((b) => {
          const isStory = STORY_TYPES.has(b.type);
          const isSelected = b.id === selectedBlockId;
          const title = b.articleId ? titles[b.articleId] : null;
          const bg =
            b.type === "masthead" || b.type === "section-band"
              ? "#A50D0D"
              : b.type === "ad"
              ? "repeating-linear-gradient(45deg,#fafafa,#fafafa 6px,#e5e7eb 6px,#e5e7eb 12px)"
              : b.locked
              ? "#fef3c7"
              : b.articleId
              ? "#dbeafe"
              : "#fee2e2";
          const color = b.type === "masthead" || b.type === "section-band" ? "#fff" : "#111";
          return (
            <div key={b.id}
              onClick={() => isStory && onSelect(b.id)}
              style={{
                background: bg, color,
                border: isSelected ? "2px solid #4f46e5" : "1px solid #e5e7eb",
                borderRadius: 4, padding: 8, fontSize: 12, overflow: "hidden",
                cursor: isStory ? "pointer" : "move",
                display: "flex", flexDirection: "column", justifyContent: "space-between",
                minHeight: 0, height: "100%",
              }}>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 10, opacity: 0.7, textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>{b.type}</div>
                {title && <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{title.slice(0, 120)}</div>}
                {!title && isStory && <div style={{ fontStyle: "italic", opacity: 0.55 }}>empty — click to pick</div>}
              </div>
              {isStory && (
                <button
                  className="lock-btn"
                  onClick={(e) => { e.stopPropagation(); onToggleLock(b.id); }}
                  style={{
                    alignSelf: "flex-start", marginTop: 4, fontSize: 10, padding: "2px 6px",
                    border: "none", borderRadius: 3, cursor: "pointer",
                    background: b.locked ? "#fbbf24" : "rgba(0,0,0,0.08)",
                    color: b.locked ? "#fff" : "#555", fontWeight: 700,
                  }}>
                  {b.locked ? "🔒 LOCKED" : "🔓 free"}
                </button>
              )}
            </div>
          );
        })}
      </GridLayout>
      <style>{`
        .re-epaper-grid .react-grid-item.react-grid-placeholder { background: #4f46e5; opacity: 0.18; border-radius: 4px; }
        .re-epaper-grid .react-resizable-handle { z-index: 5; }
      `}</style>
    </div>
  );
}
