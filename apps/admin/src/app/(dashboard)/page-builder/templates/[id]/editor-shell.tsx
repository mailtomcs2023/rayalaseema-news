"use client";

// Page Builder (Spec #2) - visual editor 3-pane shell.
//
//   Header   : [← Back] [name + slug] [Status]  [Mobile|Desktop] [Save] [Publish]
//   Palette  : list of built-in block types + composite blocks (drag source - E2)
//   Canvas   : iframe → /page-builder/preview/[id]?draft=1 (web origin)
//   Config   : per-block-type form (E4) when a block is selected
//
// Layout state lives in this component; mutations go through API + iframe
// reloads its src on each save. E2-E5 layer on drag/drop, postMessage,
// config forms, mobile variant + auto-save.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { WithTooltip } from "@/components/ui/tooltip";
import { confirm } from "@/components/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  // Loop blocks store their per-item primitive template here.
  blocks?: Block[];
  mobileVariant: "show" | "hide" | "stack-below" | "compact";
}

// Dynamic primitives addable inside a Loop (not top-level palette items).
const LOOP_PRIMITIVES = ["Heading", "Image", "Text"] as const;
const BINDING_OPTIONS = [
  { value: "static", label: "Static (type it)" },
  { value: "title", label: "Article title" },
  { value: "summary", label: "Article summary" },
  { value: "image", label: "Featured image" },
  { value: "date", label: "Published date" },
  { value: "category", label: "Category" },
  { value: "link", label: "Article link" },
];

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_CONFIG: Record<string, Record<string, unknown>> = {
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
  LatestNews: { count: 12, categorySlug: "" },
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
  Loop: { source: "latest-news", count: 12, categorySlug: "", columns: 1, gap: 16 },
  Heading: { binding: "title", level: "h3", linkToItem: true },
  Image: { binding: "image", linkToItem: true },
  Text: { binding: "summary" },
};

// --- Columns container helpers (one level of nesting) ---
// A Columns block stores its columns under config.columns: each column has an
// id + an ordered list of (leaf) blocks. These helpers find / update / remove a
// block by id ANYWHERE in the tree (top level or inside a column) so the editor
// can edit nested blocks with the same selection model.
type Col = { id: string; blocks: Block[] };
function getCols(b: Block): Col[] {
  return b.type === "Columns" && b.config ? ((b.config.columns as Col[]) || []) : [];
}
// A Loop stores its per-item primitive template in block.blocks.
function getLoopBlocks(b: Block): Block[] {
  return b.type === "Loop" ? (b.blocks || []) : [];
}
function findBlockDeep(blocks: Block[], id: string | null): Block | null {
  if (!id) return null;
  for (const b of blocks) {
    if (b.id === id) return b;
    for (const col of getCols(b)) {
      const f = col.blocks.find((x) => x.id === id);
      if (f) return f;
    }
    const lf = getLoopBlocks(b).find((x) => x.id === id);
    if (lf) return lf;
  }
  return null;
}
function mapBlockDeep(blocks: Block[], id: string, fn: (b: Block) => Block): Block[] {
  return blocks.map((b) => {
    if (b.id === id) return fn(b);
    if (b.type === "Columns") {
      const cols = getCols(b);
      if (cols.some((col) => col.blocks.some((x) => x.id === id))) {
        return {
          ...b,
          config: { ...b.config, columns: cols.map((col) => ({ ...col, blocks: col.blocks.map((x) => (x.id === id ? fn(x) : x)) })) },
        };
      }
    }
    if (b.type === "Loop") {
      const lb = getLoopBlocks(b);
      if (lb.some((x) => x.id === id)) return { ...b, blocks: lb.map((x) => (x.id === id ? fn(x) : x)) };
    }
    return b;
  });
}
function removeBlockDeep(blocks: Block[], id: string): Block[] {
  return blocks
    .filter((b) => b.id !== id)
    .map((b) => {
      if (b.type === "Columns" && getCols(b).some((col) => col.blocks.some((x) => x.id === id))) {
        return {
          ...b,
          config: {
            ...b.config,
            columns: getCols(b).map((col) => ({ ...col, blocks: col.blocks.filter((x) => x.id !== id) })),
          },
        };
      }
      if (b.type === "Loop" && getLoopBlocks(b).some((x) => x.id === id)) {
        return { ...b, blocks: getLoopBlocks(b).filter((x) => x.id !== id) };
      }
      return b;
    });
}
function findParentContainerId(blocks: Block[], childId: string | null): string | null {
  if (!childId) return null;
  for (const b of blocks) {
    if (b.type === "Columns" && getCols(b).some((col) => col.blocks.some((x) => x.id === childId))) return b.id;
    if (b.type === "Loop" && getLoopBlocks(b).some((x) => x.id === childId)) return b.id;
  }
  return null;
}

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
  // Multi-select (F1 #168) - Ctrl/Cmd+click on an outline row toggles
  // membership. Anchored to single-select state so the rest of the
  // editor (config panel) keeps working with the primary selection.
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(() => new Set());
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeNonce = useRef(0);

  // Undo / redo (H1 #171): each persistLocal call pushes the prior layout
  // onto a bounded history stack so cmd-Z reverts the last edit. cmd-shift-Z
  // pops from a redo stack. Stack capped at 50 entries to keep memory bounded.
  const undoStack = useRef<Layout[]>([]);
  const redoStack = useRef<Layout[]>([]);
  const MAX_HISTORY = 50;

  // Presence (H1 #171): poll the template endpoint every 15s and warn
  // when somebody else has updated the row since this editor session
  // opened. The save/publish handlers update openedAtRef when they
  // succeed locally to suppress false positives on our own writes.
  const openedAtRef = useRef<number>(Date.now());
  const [otherEditorWarning, setOtherEditorWarning] = useState<string | null>(null);

  const previewSrc = `${webUrl}/page-builder/preview/${initial.id}?draft=1&_n=${iframeNonce.current}`;

  // Reload the iframe whenever the draft changes (E3+ will replace this
  // with surgical postMessage updates - for E1 the full reload keeps the
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
      // acted on here - H1 (#171) will use them for a "preview ready"
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

  // Deep lookup so blocks nested inside a Columns container are selectable too.
  const selected = useMemo(
    () => findBlockDeep(layout.blocks, selectedId),
    [layout.blocks, selectedId],
  );
  // When the selected block lives inside a Columns container, this is that
  // container's id (used for a "back to Columns" breadcrumb).
  const parentContainerId = useMemo(
    () => findParentContainerId(layout.blocks, selectedId),
    [layout.blocks, selectedId],
  );

  // Auto-save (E5 #167) - 5 s of layout inactivity ⇒ flush draft to the
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
        // Our own write - keep the presence baseline current so the poll
        // doesn't flag it as "someone else saved".
        openedAtRef.current = Date.now();
        setOtherEditorWarning(null);
        // Re-render the canvas so newly added/edited blocks (e.g. Columns and
        // their children) actually appear without requiring a manual Save.
        refreshPreview();
      } else {
        // Bubble the validation error up to the manual error banner so the
        // operator sees what went wrong (Zod issues from invalid configs).
        const body = await res.json().catch(() => ({} as { error?: string; details?: { fieldErrors?: Record<string, unknown> } }));
        const fe = body?.details?.fieldErrors;
        const detail = fe && Object.keys(fe).length
          ? " — " + JSON.stringify(fe)
          : body?.details
          ? " — " + JSON.stringify(body.details)
          : "";
        setError((body?.error || "Auto-save failed") + detail);
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

  // Immediately persist a layout to the draft endpoint + reload the canvas, so
  // STRUCTURAL changes (column count, add/remove/move/replace blocks) reflect
  // right away instead of waiting for the 5s auto-save.
  async function flushLayout(next: Layout) {
    const snapshot = JSON.stringify(next);
    if (snapshot === lastSavedJson.current) {
      refreshPreview();
      return;
    }
    setAutoSaving(true);
    const res = await fetch(`/api/page-builder/templates/${initial.id}/draft`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: `{"draftLayout":${snapshot}}`,
    });
    setAutoSaving(false);
    if (res.ok) {
      lastSavedJson.current = snapshot;
      setSavedAt(new Date());
      // Our own write - don't let the presence poll flag it as a foreign edit.
      openedAtRef.current = Date.now();
      setOtherEditorWarning(null);
      refreshPreview();
    } else {
      const body = await res.json().catch(() => ({} as { error?: string; details?: { fieldErrors?: Record<string, unknown> } }));
      const fe = body?.details?.fieldErrors;
      const detail = fe && Object.keys(fe).length ? " — " + JSON.stringify(fe) : body?.details ? " — " + JSON.stringify(body.details) : "";
      setError((body?.error || "Save failed") + detail);
    }
  }

  function persistLocal(next: Layout, flush = false) {
    undoStack.current.push(layout);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    setLayout(next);
    if (flush) flushLayout(next);
  }

  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(layout);
    if (redoStack.current.length > MAX_HISTORY) redoStack.current.shift();
    setLayout(prev);
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(layout);
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    setLayout(next);
  }

  // Keyboard shortcuts: cmd/ctrl+Z = undo, cmd/ctrl+shift+Z = redo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Ignore when typing in inputs / textareas / contenteditable.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  // Presence: poll for foreign updates every 15s.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/page-builder/templates/${initial.id}`);
        if (!res.ok) return;
        const json = await res.json();
        const remoteAt = new Date(json.updatedAt).getTime();
        if (remoteAt > openedAtRef.current + 2000) {
          setOtherEditorWarning(
            "Someone else has saved this template since you opened it. Your next save will overwrite their changes - refresh first if you want to keep theirs.",
          );
        }
      } catch {
        /* ignore - transient network */
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [initial.id]);

  function addBlock(type: string, compositeId?: string, position?: number) {
    const id = makeId(type === "Composite" ? "comp" : type.slice(0, 3).toLowerCase());
    const block: Block =
      type === "Composite"
        ? { id, type, compositeId: compositeId!, mobileVariant: "show" }
        : type === "Columns"
        ? {
            id,
            type,
            config: {
              columns: [
                { id: makeId("col"), blocks: [] },
                { id: makeId("col"), blocks: [] },
              ],
              gap: 24,
              stackMobile: true,
            },
            mobileVariant: "show",
          }
        : type === "Loop"
        ? { id, type, config: { ...(DEFAULT_CONFIG.Loop || {}) }, blocks: [], mobileVariant: "show" }
        : { id, type, config: { ...(DEFAULT_CONFIG[type] || {}) }, mobileVariant: "show" };
    const next = [...layout.blocks];
    if (position === undefined || position < 0 || position > next.length) {
      next.push(block);
    } else {
      next.splice(position, 0, block);
    }
    persistLocal({ ...layout, blocks: next }, true);
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
    persistLocal({ ...layout, blocks: next }, true);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    const idx = layout.blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const j = idx + dir;
    if (j < 0 || j >= layout.blocks.length) return;
    const next = [...layout.blocks];
    [next[idx], next[j]] = [next[j], next[idx]];
    persistLocal({ ...layout, blocks: next }, true);
  }

  function deleteBlock(id: string) {
    persistLocal({ ...layout, blocks: removeBlockDeep(layout.blocks, id) }, true);
    if (selectedId === id) setSelectedId(null);
  }

  function updateBlock(id: string, patch: Partial<Block>) {
    persistLocal({ ...layout, blocks: mapBlockDeep(layout.blocks, id, (b) => ({ ...b, ...patch })) });
  }

  // --- Columns container ops ---
  // Change a Columns block's column count - grows with empty columns, or trims
  // trailing columns (and their blocks) when shrinking.
  function setColumnCount(colsId: string, count: number) {
    persistLocal({
      ...layout,
      blocks: mapBlockDeep(layout.blocks, colsId, (b) => {
        const cols = getCols(b);
        let next = cols;
        if (count > cols.length) {
          next = [...cols];
          while (next.length < count) next.push({ id: makeId("col"), blocks: [] });
        } else if (count < cols.length) {
          next = cols.slice(0, count);
        }
        return { ...b, config: { ...b.config, columns: next } };
      }),
    }, true);
  }

  // Append a new leaf block into a specific column.
  function addBlockToColumn(colsId: string, colId: string, type: string) {
    if (type === "Columns" || type === "Composite") return; // leaf blocks only
    const leaf: Block = {
      id: makeId(type.slice(0, 3).toLowerCase()),
      type,
      config: { ...(DEFAULT_CONFIG[type] || {}) },
      mobileVariant: "show",
    };
    persistLocal({
      ...layout,
      blocks: mapBlockDeep(layout.blocks, colsId, (b) => ({
        ...b,
        config: {
          ...b.config,
          columns: getCols(b).map((col) => (col.id === colId ? { ...col, blocks: [...col.blocks, leaf] } : col)),
        },
      })),
    }, true);
    setSelectedId(leaf.id);
  }

  // Replace a block in a column with a fresh block of a different type (keeps
  // its position + mobile variant). Lets the operator swap a column's block
  // without delete-then-add.
  function replaceBlockInColumn(colsId: string, colId: string, blockId: string, newType: string) {
    if (newType === "Columns" || newType === "Composite") return;
    persistLocal({
      ...layout,
      blocks: mapBlockDeep(layout.blocks, colsId, (b) => ({
        ...b,
        config: {
          ...b.config,
          columns: getCols(b).map((col) => {
            if (col.id !== colId) return col;
            return {
              ...col,
              blocks: col.blocks.map((x) =>
                x.id === blockId
                  ? { id: makeId(newType.slice(0, 3).toLowerCase()), type: newType, config: { ...(DEFAULT_CONFIG[newType] || {}) }, mobileVariant: x.mobileVariant }
                  : x,
              ),
            };
          }),
        },
      })),
    }, true);
  }

  // Reorder a block within its column.
  function moveBlockInColumn(colsId: string, colId: string, blockId: string, dir: -1 | 1) {
    persistLocal({
      ...layout,
      blocks: mapBlockDeep(layout.blocks, colsId, (b) => ({
        ...b,
        config: {
          ...b.config,
          columns: getCols(b).map((col) => {
            if (col.id !== colId) return col;
            const i = col.blocks.findIndex((x) => x.id === blockId);
            const j = i + dir;
            if (i === -1 || j < 0 || j >= col.blocks.length) return col;
            const nb = [...col.blocks];
            [nb[i], nb[j]] = [nb[j], nb[i]];
            return { ...col, blocks: nb };
          }),
        },
      })),
    }, true);
  }

  // --- Loop container ops ---
  // Append a primitive (Heading/Image/Text) to a Loop's per-item template.
  function addBlockToLoop(loopId: string, type: string) {
    if (!LOOP_PRIMITIVES.includes(type as (typeof LOOP_PRIMITIVES)[number])) return;
    const prim: Block = {
      id: makeId(type.slice(0, 3).toLowerCase()),
      type,
      config: { ...(DEFAULT_CONFIG[type] || {}) },
      mobileVariant: "show",
    };
    persistLocal(
      { ...layout, blocks: mapBlockDeep(layout.blocks, loopId, (b) => ({ ...b, blocks: [...getLoopBlocks(b), prim] })) },
      true,
    );
    setSelectedId(prim.id);
  }

  // Reorder a primitive within its Loop's template.
  function moveBlockInLoop(loopId: string, blockId: string, dir: -1 | 1) {
    persistLocal(
      {
        ...layout,
        blocks: mapBlockDeep(layout.blocks, loopId, (b) => {
          const lb = [...getLoopBlocks(b)];
          const i = lb.findIndex((x) => x.id === blockId);
          const j = i + dir;
          if (i === -1 || j < 0 || j >= lb.length) return b;
          [lb[i], lb[j]] = [lb[j], lb[i]];
          return { ...b, blocks: lb };
        }),
      },
      true,
    );
  }

  function toggleMultiSelect(id: string) {
    setMultiSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // F1: Replace multi-selected blocks with a new Composite that wraps them.
  async function createCompositeFromSelection(name: string, slug: string, description: string) {
    if (multiSelectedIds.size < 2) {
      setError("Pick at least two blocks to group.");
      return;
    }
    const selectedBlocks = layout.blocks.filter((b) => multiSelectedIds.has(b.id));
    if (selectedBlocks.some((b) => b.type === "Composite")) {
      setError("Nested composites aren't allowed yet. Ungroup before grouping.");
      return;
    }
    setError(null);
    const res = await fetch("/api/page-builder/composites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        slug: slug || undefined,
        description: description || null,
        blocks: selectedBlocks,
      }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Create composite failed");
      return;
    }
    const composite = await res.json();

    // Find the index of the first selected block - that's where the
    // Composite reference goes. Strip all multi-selected blocks and
    // splice the new Composite block in.
    const firstIdx = layout.blocks.findIndex((b) => multiSelectedIds.has(b.id));
    const remaining = layout.blocks.filter((b) => !multiSelectedIds.has(b.id));
    const newBlock: Block = {
      id: makeId("comp"),
      type: "Composite",
      compositeId: composite.id,
      mobileVariant: "show",
    };
    const next = [...remaining];
    next.splice(firstIdx, 0, newBlock);
    persistLocal({ ...layout, blocks: next }, true);

    setMultiSelectedIds(new Set());
    setSelectedId(newBlock.id);
    setShowGroupModal(false);

    // The composites prop is server-rendered; refresh the page so the
    // new entry appears in the palette + selectable list.
    if (typeof window !== "undefined") window.location.reload();
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
    openedAtRef.current = Date.now();
    setOtherEditorWarning(null);
    refreshPreview();
  }

  async function publish() {
    if (
      !(await confirm({
        title: "Publish the current draft?",
        description: "This snapshots a new version and updates the live site.",
        confirmText: "Publish",
      }))
    )
      return;
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
    openedAtRef.current = Date.now();
    setOtherEditorWarning(null);
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
          <WithTooltip text="Undo (Cmd/Ctrl+Z)">
            <button
              onClick={undo}
              disabled={undoStack.current.length === 0}
              style={btnSecondary}
            >
              ↶ Undo
            </button>
          </WithTooltip>
          <WithTooltip text="Redo (Cmd/Ctrl+Shift+Z)">
            <button
              onClick={redo}
              disabled={redoStack.current.length === 0}
              style={btnSecondary}
            >
              ↷ Redo
            </button>
          </WithTooltip>
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
          {multiSelectedIds.size >= 2 && (
            <button onClick={() => setShowGroupModal(true)} style={btnSecondary}>
              Group {multiSelectedIds.size} into composite
            </button>
          )}
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

      {otherEditorWarning && (
        <div
          style={{
            background: "#FEF3C7",
            color: "#92400E",
            border: "1px solid #FCD34D",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 10,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          ⚠ {otherEditorWarning}
          <button
            onClick={() => setOtherEditorWarning(null)}
            style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "#92400E", fontSize: 16 }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

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
            multiSelectedIds={multiSelectedIds}
            onSelect={(id, withModifier) => {
              if (withModifier) {
                toggleMultiSelect(id);
              } else {
                setSelectedId(id);
                setMultiSelectedIds(new Set());
              }
            }}
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
          ) : selected.type === "Columns" ? (
            <ColumnsConfig
              block={selected}
              leafTypes={builtinBlockTypes.filter((t) => t !== "Columns")}
              onChange={(patch) => updateBlock(selected.id, patch)}
              onSetCount={(n) => setColumnCount(selected.id, n)}
              onAddToColumn={(colId, type) => addBlockToColumn(selected.id, colId, type)}
              onReplaceChild={(colId, childId, type) => replaceBlockInColumn(selected.id, colId, childId, type)}
              onSelectChild={(childId) => setSelectedId(childId)}
              onMoveChild={(colId, childId, dir) => moveBlockInColumn(selected.id, colId, childId, dir)}
              onDeleteChild={(childId) => deleteBlock(childId)}
              onDelete={() => deleteBlock(selected.id)}
            />
          ) : selected.type === "Loop" ? (
            <LoopConfig
              block={selected}
              onChange={(patch) => updateBlock(selected.id, patch)}
              onAdd={(type) => addBlockToLoop(selected.id, type)}
              onSelectChild={(childId) => setSelectedId(childId)}
              onMoveChild={(childId, dir) => moveBlockInLoop(selected.id, childId, dir)}
              onDeleteChild={(childId) => deleteBlock(childId)}
              onDelete={() => deleteBlock(selected.id)}
            />
          ) : (
            <>
              {parentContainerId && (
                <button
                  onClick={() => setSelectedId(parentContainerId)}
                  style={{ ...btnSecondary, marginBottom: 10, width: "100%" }}
                >
                  ↑ Back to container
                </button>
              )}
              <ConfigPanel
                block={selected}
                composites={composites}
                onChange={(patch) => updateBlock(selected.id, patch)}
                onDelete={() => deleteBlock(selected.id)}
              />
            </>
          )}
        </aside>
      </div>

      {showGroupModal && (
        <GroupModal
          count={multiSelectedIds.size}
          onClose={() => setShowGroupModal(false)}
          onSubmit={createCompositeFromSelection}
        />
      )}
    </div>
  );
}

function GroupModal({
  count,
  onClose,
  onSubmit,
}: {
  count: number;
  onClose: () => void;
  onSubmit: (name: string, slug: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit(name, slug, description);
    setSubmitting(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onClose}>
      <form
        onSubmit={go}
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
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 4 }}>Group into composite</h2>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          Wraps the {count} selected blocks in a new reusable composite. The blocks are removed
          from this template and replaced with a single Composite reference at the position of
          the first selected block.
        </p>

        <Label>Name</Label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} required style={inp} placeholder="Election Day Hero" />

        <Label>Slug (optional)</Label>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} style={inp} placeholder="auto from name" />

        <Label>Description (optional)</Label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button type="button" onClick={onClose} style={btnSecondary} disabled={submitting}>Cancel</button>
          <button type="submit" style={btnPrimary} disabled={submitting}>
            {submitting ? "Grouping…" : "Group"}
          </button>
        </div>
      </form>
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
    >
      + {label}
    </button>
  );
}

function BlockList({
  blocks,
  selectedId,
  multiSelectedIds,
  onSelect,
  onMove,
  onDelete,
  onReorder,
  onDropNew,
  composites,
}: {
  blocks: Block[];
  selectedId: string | null;
  multiSelectedIds: Set<string>;
  onSelect: (id: string, withModifier: boolean) => void;
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
            <WithTooltip
              text={multiSelectedIds.has(b.id) ? "Click to keep selecting; Cmd/Ctrl-click to toggle" : "Cmd/Ctrl-click to multi-select"}
            >
              <div
                onClick={(e) => onSelect(b.id, e.metaKey || e.ctrlKey)}
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
                  ...(multiSelectedIds.has(b.id) ? blockRowMulti : {}),
                }}
              >
                <WithTooltip text="Drag to reorder">
                  <span style={{ color: "#9ca3af", cursor: "grab", marginRight: 4 }}>⋮⋮</span>
                </WithTooltip>
                <span style={{ flex: 1, fontWeight: 600 }}>
                  {i + 1}. {b.type}
                  {compName && <span style={{ color: "#6b7280", fontWeight: 400 }}> · {compName}</span>}
                </span>
                <WithTooltip text="Move up">
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(b.id, -1); }}
                    disabled={i === 0}
                    style={iconBtn}
                  >▲</button>
                </WithTooltip>
                <WithTooltip text="Move down">
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(b.id, 1); }}
                    disabled={i === blocks.length - 1}
                    style={iconBtn}
                  >▼</button>
                </WithTooltip>
                <WithTooltip text="Delete">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}
                    style={{ ...iconBtn, color: "#B91C1C" }}
                  >✕</button>
                </WithTooltip>
              </div>
            </WithTooltip>
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
            <option value="">- Pick a composite -</option>
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

// Loop container editor: data source (count/category) + grid columns + the
// per-item primitive template (Heading/Image/Text). Selecting a primitive opens
// its binding config (with a "Back to container" breadcrumb).
function LoopConfig({
  block,
  onChange,
  onAdd,
  onSelectChild,
  onMoveChild,
  onDeleteChild,
  onDelete,
}: {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
  onAdd: (type: string) => void;
  onSelectChild: (childId: string) => void;
  onMoveChild: (childId: string, dir: -1 | 1) => void;
  onDeleteChild: (childId: string) => void;
  onDelete: () => void;
}) {
  const cfg = (block.config || {}) as { count?: number; categorySlug?: string; columns?: number; gap?: number };
  const items = block.blocks || [];
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Selected</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>🔁 Loop · Latest news</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 12 }}>{block.id}</div>

      <Label>How many articles</Label>
      <Input type="number" min={1} max={60} value={cfg.count ?? 12} onChange={(e) => onChange({ config: { ...block.config, count: Number(e.target.value) } })} className="mb-2" />

      <Label>Category slug (blank = all)</Label>
      <Input value={cfg.categorySlug ?? ""} onChange={(e) => onChange({ config: { ...block.config, categorySlug: e.target.value } })} placeholder="blank = all latest news" className="mb-2" />

      <Label>Grid columns</Label>
      <Select value={String(cfg.columns ?? 1)} onValueChange={(v) => onChange({ config: { ...block.config, columns: Number(v) } })}>
        <SelectTrigger className="w-full mb-2"><SelectValue /></SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4].map((n) => (
            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Label>Gap (px)</Label>
      <Input type="number" min={0} max={64} value={cfg.gap ?? 16} onChange={(e) => onChange({ config: { ...block.config, gap: Number(e.target.value) } })} className="mb-2" />

      <Label>Mobile variant</Label>
      <Select value={block.mobileVariant} onValueChange={(v) => onChange({ mobileVariant: v as Block["mobileVariant"] })}>
        <SelectTrigger className="w-full mb-2"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="show">Show</SelectItem>
          <SelectItem value="hide">Hide on mobile</SelectItem>
          <SelectItem value="stack-below">Stack below</SelectItem>
          <SelectItem value="compact">Compact</SelectItem>
        </SelectContent>
      </Select>

      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "14px 0" }} />

      <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
        Item template · {items.length} block{items.length === 1 ? "" : "s"} (repeats per article)
      </div>
      {items.length === 0 && (
        <div style={{ ...paletteHint, padding: 4 }}>No blocks yet. Add Heading / Image / Text — bind each to an article field.</div>
      )}
      {items.map((cb, i) => (
        <div key={cb.id} className="flex items-center gap-1 mb-1.5">
          <span onClick={() => onSelectChild(cb.id)} style={{ flex: 1, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            {cb.type}
            <span style={{ color: "#6b7280", fontWeight: 400 }}> · {((cb.config as { binding?: string })?.binding) ?? ""}</span>
          </span>
          <WithTooltip text="Edit binding"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSelectChild(cb.id)}>⚙</Button></WithTooltip>
          <WithTooltip text="Move up"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => onMoveChild(cb.id, -1)}>▲</Button></WithTooltip>
          <WithTooltip text="Move down"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === items.length - 1} onClick={() => onMoveChild(cb.id, 1)}>▼</Button></WithTooltip>
          <WithTooltip text="Remove"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteChild(cb.id)}>✕</Button></WithTooltip>
        </div>
      ))}
      <Select value="" onValueChange={(v) => { if (v) onAdd(v); }}>
        <SelectTrigger className="h-8 w-full text-xs mt-1"><SelectValue placeholder="+ Add Heading / Image / Text…" /></SelectTrigger>
        <SelectContent>
          {LOOP_PRIMITIVES.map((t) => (
            <SelectItem key={t} value={t}>{t}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />
      <Button type="button" variant="outline" className="w-full text-destructive hover:text-destructive" onClick={onDelete}>
        Delete Loop block
      </Button>
    </div>
  );
}

// Columns container editor: column count + gap + per-column block management.
// Each column lists its blocks (click to edit, ▲▼ reorder, ✕ remove) and has an
// "+ Add block" picker. Selecting a nested block swaps the panel to that block's
// own config (with a "Back to Columns" breadcrumb in the parent shell).
function ColumnsConfig({
  block,
  leafTypes,
  onChange,
  onSetCount,
  onAddToColumn,
  onReplaceChild,
  onSelectChild,
  onMoveChild,
  onDeleteChild,
  onDelete,
}: {
  block: Block;
  leafTypes: string[];
  onChange: (patch: Partial<Block>) => void;
  onSetCount: (n: number) => void;
  onAddToColumn: (colId: string, type: string) => void;
  onReplaceChild: (colId: string, childId: string, type: string) => void;
  onSelectChild: (childId: string) => void;
  onMoveChild: (colId: string, childId: string, dir: -1 | 1) => void;
  onDeleteChild: (childId: string) => void;
  onDelete: () => void;
}) {
  const cfg = (block.config || {}) as { columns?: Col[]; gap?: number; stackMobile?: boolean };
  const cols = cfg.columns || [];
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 4 }}>Selected</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4 }}>▦ Columns</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 12 }}>{block.id}</div>

      <Label>Number of columns</Label>
      <Select value={String(cols.length)} onValueChange={(v) => onSetCount(Number(v))}>
        <SelectTrigger className="w-full mb-2"><SelectValue /></SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4].map((n) => (
            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Label>Gap (px)</Label>
      <Input
        type="number"
        min={0}
        max={64}
        value={cfg.gap ?? 24}
        onChange={(e) => onChange({ config: { ...block.config, gap: Number(e.target.value) } })}
        className="mb-2"
      />

      <label className="flex items-center gap-2 text-sm mb-3 mt-1 cursor-pointer">
        <Checkbox
          checked={cfg.stackMobile !== false}
          onCheckedChange={(v) => onChange({ config: { ...block.config, stackMobile: v === true } })}
        />
        Stack columns on mobile
      </label>

      <Label>Mobile variant</Label>
      <Select value={block.mobileVariant} onValueChange={(v) => onChange({ mobileVariant: v as Block["mobileVariant"] })}>
        <SelectTrigger className="w-full mb-2"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="show">Show</SelectItem>
          <SelectItem value="hide">Hide on mobile</SelectItem>
          <SelectItem value="stack-below">Stack below</SelectItem>
          <SelectItem value="compact">Compact</SelectItem>
        </SelectContent>
      </Select>

      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "14px 0" }} />

      {cols.map((col, ci) => (
        <div key={col.id} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, marginBottom: 10, background: "#fafafa" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
            Column {ci + 1} · {col.blocks.length} block{col.blocks.length === 1 ? "" : "s"}
          </div>
          {col.blocks.length === 0 && <div style={{ ...paletteHint, padding: 4 }}>No blocks yet.</div>}
          {col.blocks.map((cb, bi) => (
            <div key={cb.id} className="flex items-center gap-1 mb-1.5">
              {/* Swap the block's type in place (replace) */}
              <Select value={cb.type} onValueChange={(v) => onReplaceChild(col.id, cb.id, v)}>
                <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {leafTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <WithTooltip text="Edit settings">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onSelectChild(cb.id)}>⚙</Button>
              </WithTooltip>
              <WithTooltip text="Move up">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={bi === 0} onClick={() => onMoveChild(col.id, cb.id, -1)}>▲</Button>
              </WithTooltip>
              <WithTooltip text="Move down">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={bi === col.blocks.length - 1} onClick={() => onMoveChild(col.id, cb.id, 1)}>▼</Button>
              </WithTooltip>
              <WithTooltip text="Remove">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDeleteChild(cb.id)}>✕</Button>
              </WithTooltip>
            </div>
          ))}
          <Select value="" onValueChange={(v) => { if (v) onAddToColumn(col.id, v); }}>
            <SelectTrigger className="h-8 w-full text-xs mt-1"><SelectValue placeholder="+ Add block…" /></SelectTrigger>
            <SelectContent>
              {leafTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}

      <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />
      <Button type="button" variant="outline" className="w-full text-destructive hover:text-destructive" onClick={onDelete}>
        Delete Columns block
      </Button>
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
    case "LatestNews":
      return (
        <>
          <SmallNumber label="Count" value={(cfg.count as number) ?? 12} onChange={(v) => setCfg({ count: v })} min={1} max={60} />
          <SmallText
            label="Category slug (blank = all)"
            value={(cfg.categorySlug as string) || ""}
            onChange={(v) => setCfg({ categorySlug: v })}
            placeholder="leave blank for all latest news"
          />
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
    case "Heading":
      return (
        <>
          <SmallSelect label="Bind to" value={(cfg.binding as string) || "title"} onChange={(v) => setCfg({ binding: v })} options={BINDING_OPTIONS} />
          {cfg.binding === "static" && (
            <SmallText label="Static text" value={(cfg.staticText as string) || ""} onChange={(v) => setCfg({ staticText: v })} />
          )}
          <SmallSelect label="Level" value={(cfg.level as string) || "h3"} onChange={(v) => setCfg({ level: v })} options={[{ value: "h2", label: "H2" }, { value: "h3", label: "H3" }, { value: "h4", label: "H4" }]} />
          <SmallCheckbox label="Link to article" value={cfg.linkToItem !== false} onChange={(v) => setCfg({ linkToItem: v })} />
        </>
      );
    case "Text":
      return (
        <>
          <SmallSelect label="Bind to" value={(cfg.binding as string) || "summary"} onChange={(v) => setCfg({ binding: v })} options={BINDING_OPTIONS} />
          {cfg.binding === "static" && (
            <SmallText label="Static text" value={(cfg.staticText as string) || ""} onChange={(v) => setCfg({ staticText: v })} />
          )}
        </>
      );
    case "Image":
      return (
        <>
          <SmallSelect label="Bind to" value={(cfg.binding as string) || "image"} onChange={(v) => setCfg({ binding: v })} options={BINDING_OPTIONS} />
          {cfg.binding === "static" && (
            <SmallText label="Static image URL" value={(cfg.staticUrl as string) || ""} onChange={(v) => setCfg({ staticUrl: v })} placeholder="https://…" />
          )}
          <SmallCheckbox label="Link to article" value={cfg.linkToItem !== false} onChange={(v) => setCfg({ linkToItem: v })} />
        </>
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
const blockRowMulti: React.CSSProperties = {
  border: "1px solid #2563EB",
  background: "#EFF6FF",
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
