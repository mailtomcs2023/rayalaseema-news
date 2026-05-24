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

import { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "@/components/sidebar";
import { ToastViewport, useToasts } from "@/components/toast";
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
  version: number;     // optimistic-concurrency token; bumps on every PATCH
}
interface Edition {
  id: string;
  date: string;
  status: string;
  workflowState: "DRAFT" | "SUB_REVIEW" | "CHIEF_REVIEW" | "APPROVED" | "PUBLISHED" | "REJECTED";
  workflowNote: string | null;
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
  breaking?: boolean;
  featured?: boolean;
  viewCount?: number;
}

type SortKey = "newest" | "views" | "breaking" | "featured";

// Operator-toggleable filter chips. Slot defaults populate the chip state on
// block-select; operator can untick to widen the search.
interface PickerFilters {
  hasImage: boolean;
  minWords: number;        // 0 = no requirement
  categorySlug: string;    // "" = no category filter
  districtSlug: string;    // "" = no district filter
  breaking: boolean;
  featured: boolean;
  windowDays: number;      // 1 | 7 | 30 | 90 | 365
  sort: SortKey;
}

const DEFAULT_FILTERS: PickerFilters = {
  hasImage: false, minWords: 0, categorySlug: "", districtSlug: "",
  breaking: false, featured: false, windowDays: 7, sort: "newest",
};

const STORY_TYPES = new Set(["lead", "major", "secondary", "brief"]);

export default function EpaperEditorPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [activePageIdx, setActivePageIdx] = useState(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  // Multi-select set (per-page). Shift-click adds/removes; plain click clears.
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());

  const [pickerArticles, setPickerArticles] = useState<ArticleSummary[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerFilters, setPickerFilters] = useState<PickerFilters>(DEFAULT_FILTERS);
  const [pickerTotal, setPickerTotal] = useState(0);  // total in window before chip filters — for empty-state hints

  const { toasts, push: toast, dismiss: dismissToast } = useToasts();

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
  // Note: comments badge reload moved below `loadComments` definition to dodge
  // a temporal-dead-zone error in the Next.js prerender.

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
      toast("success", `PDF rendered — ${data.pageCount} pages`);
      // Continuity gate: warn if any article appears on more than one page.
      if (Array.isArray(data.duplicates) && data.duplicates.length > 0) {
        for (const d of data.duplicates.slice(0, 3)) {
          toast("warn", `Duplicate: "${d.title.slice(0, 50)}" on pages ${d.placements.map((p: any) => p.pageNumber).join(", ")}`);
        }
      }
      // Quality gates: empty story slots, long English runs, missing-glyph chars.
      if (Array.isArray(data.qualityWarnings) && data.qualityWarnings.length > 0) {
        const empties = data.qualityWarnings.filter((w: any) => w.kind === "empty-story");
        const others = data.qualityWarnings.filter((w: any) => w.kind !== "empty-story");
        if (empties.length > 0) toast("warn", `${empties.length} empty story block${empties.length > 1 ? "s" : ""} on rendered pages`);
        for (const w of others.slice(0, 3)) {
          toast("warn", `Page ${w.pageNumber} · ${w.kind}: ${w.detail.slice(0, 60)}`);
        }
      }
      if (data.pdfUrl) window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const activePage = edition?.pages?.[activePageIdx];

  // When a block is selected, seed the chip filters from its slot rules.
  // Operator can untick chips after this to widen.
  useEffect(() => {
    if (!selectedBlockId || !activePage) return;
    const block = activePage.layout.blocks.find((b) => b.id === selectedBlockId);
    if (!block) return;
    setPickerFilters((f) => ({
      ...DEFAULT_FILTERS,
      hasImage: !!(block.slotFilter?.minImages && block.slotFilter.minImages > 0),
      categorySlug: block.slotFilter?.categorySlug || "",
      districtSlug: block.slotFilter?.districtSlug || "",
      // Keep operator's current windowDays/sort preferences across slots.
      windowDays: f.windowDays,
      sort: f.sort,
    }));
  }, [selectedBlockId, activePage]);

  // Refetch picker results whenever the selected block, query, or any chip changes.
  useEffect(() => {
    if (!selectedBlockId || !activePage) { setPickerArticles([]); setPickerTotal(0); return; }
    const params = new URLSearchParams();
    if (pickerFilters.categorySlug) params.set("categorySlug", pickerFilters.categorySlug);
    if (pickerFilters.districtSlug) params.set("districtSlug", pickerFilters.districtSlug);
    if (pickerFilters.hasImage) params.set("hasImage", "1");
    if (pickerFilters.minWords > 0) params.set("minWords", String(pickerFilters.minWords));
    if (pickerFilters.breaking) params.set("breaking", "1");
    if (pickerFilters.featured) params.set("featured", "1");
    params.set("windowDays", String(pickerFilters.windowDays));
    params.set("sort", pickerFilters.sort);
    if (pickerQuery) params.set("q", pickerQuery);
    fetch(`/api/epaper/article-picker?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => { setPickerArticles(data.articles || []); setPickerTotal(data.totalInWindow ?? 0); });
  }, [selectedBlockId, pickerQuery, pickerFilters, activePage]);

  // Workflow transitions — what's available depends on the current state.
  // The full transitions table lives server-side; here we just hit the API
  // and let it 403 if the role doesn't match. We pre-compute label/style.
  const WORKFLOW_LABEL: Record<string, string> = {
    DRAFT: "📝 Draft", SUB_REVIEW: "👀 Sub-editor review",
    CHIEF_REVIEW: "🧐 Chief review", APPROVED: "✅ Approved",
    PUBLISHED: "📰 Published", REJECTED: "↩ Rejected",
  };
  const WORKFLOW_COLOR: Record<string, string> = {
    DRAFT: "#6b7280", SUB_REVIEW: "#f59e0b", CHIEF_REVIEW: "#0ea5e9",
    APPROVED: "#16a34a", PUBLISHED: "#7c3aed", REJECTED: "#dc2626",
  };
  // Next-state buttons per source state. Mirrors workflow.ts TRANSITIONS for UX —
  // the server is the source of truth and will 403 unauthorized clicks.
  const NEXT_STATES: Record<string, Array<{ to: string; label: string; needNote?: boolean; danger?: boolean }>> = {
    DRAFT: [{ to: "SUB_REVIEW", label: "Submit for review" }],
    SUB_REVIEW: [
      { to: "CHIEF_REVIEW", label: "Pass to chief" },
      { to: "REJECTED", label: "Reject", needNote: true, danger: true },
    ],
    CHIEF_REVIEW: [
      { to: "APPROVED", label: "Approve" },
      { to: "REJECTED", label: "Reject", needNote: true, danger: true },
    ],
    APPROVED: [{ to: "PUBLISHED", label: "Publish to web + WhatsApp + push" }],
    PUBLISHED: [{ to: "DRAFT", label: "Unpublish", danger: true }],
    REJECTED: [{ to: "DRAFT", label: "Reopen as draft" }],
  };
  const transitionTo = async (to: string, label: string, needNote: boolean) => {
    if (!edition) return;
    const note = needNote ? prompt(`${label} — reason note (required):`) : null;
    if (needNote && !note) return;
    const r = await fetch(`/api/epaper/edition/${edition.id}/transition`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, note }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || "Transition failed"); return; }
    await loadEdition(date);
  };

  // Page CRUD state: modal for inserting a new page from a template.
  const [insertOpen, setInsertOpen] = useState(false);
  const [templateOptions, setTemplateOptions] = useState<Array<{ slug: string; name: string; type: string }>>([]);
  const [insertTemplate, setInsertTemplate] = useState("");
  const loadTemplateOptions = async () => {
    if (templateOptions.length > 0) return;
    const r = await fetch("/api/epaper/templates");
    const data = await r.json();
    setTemplateOptions(data.filter((t: any) => t.active).map((t: any) => ({ slug: t.slug, name: t.name, type: t.type })));
  };
  const insertPage = async () => {
    if (!edition || !insertTemplate) return;
    const insertAfter = activePage?.pageNumber ?? edition.pages.length;
    const r = await fetch("/api/epaper/pages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editionId: edition.id, templateSlug: insertTemplate, insertAfter }),
    });
    if (!r.ok) { setError("Insert failed"); return; }
    setInsertOpen(false);
    setInsertTemplate("");
    await loadEdition(date);
  };
  const duplicatePage = async (pageId: string) => {
    const r = await fetch(`/api/epaper/pages/${pageId}`, { method: "POST" });
    if (!r.ok) { setError("Duplicate failed"); return; }
    await loadEdition(date);
  };
  const deletePage = async (pageId: string, label: string) => {
    if (!confirm(`Delete page "${label}"? A snapshot will be auto-saved so you can restore from History.`)) return;
    const r = await fetch(`/api/epaper/pages/${pageId}`, { method: "DELETE" });
    if (!r.ok) { setError("Delete failed"); return; }
    await loadEdition(date);
  };

  // Real-time presence: tracks other editors on this edition via SSE.
  interface Peer { userId: string; userName: string; pageId: string | null }
  const [peers, setPeers] = useState<Peer[]>([]);
  useEffect(() => {
    if (!edition) return;
    // Open SSE stream for live peer updates
    const es = new EventSource(`/api/epaper/edition/${edition.id}/presence`);
    es.onmessage = (e) => {
      try { setPeers(JSON.parse(e.data)); } catch {}
    };
    // Send heartbeat every 10 s + whenever active page changes
    const beat = () => {
      fetch(`/api/epaper/edition/${edition.id}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: activePage?.id ?? null }),
        keepalive: true,
      }).catch(() => {});
    };
    beat();
    const interval = setInterval(beat, 10_000);
    return () => { clearInterval(interval); es.close(); };
  }, [edition, activePage]);

  // First-time walkthrough tour — fires once per browser, persists dismissal.
  const TOUR_STEPS = [
    { title: "Welcome to ePaper v3", body: "Quick 6-step tour to get you publishing. Press Esc anytime to dismiss." },
    { title: "1. Generate today's edition", body: "Pick a date and hit Generate. The auto-fill engine assigns recent articles to all 30+ page templates." },
    { title: "2. Switch between pages", body: "Use the left page list — each tab shows ⚠ empty / 🔒 locked / 💬 comment counts at a glance." },
    { title: "3. Swap stories", body: "Click any story block on the canvas. The right panel lets you pick a different article (with chip filters)." },
    { title: "4. Lock + comment", body: "Lock blocks the auto-fill shouldn't touch. Leave 💬 Comments for the chief editor on specific blocks." },
    { title: "5. Render PDF", body: "When happy, Render PDF → vector output with real text + working hyperlinks + cross-page jumps." },
    { title: "6. Snapshots + workflow", body: "Use ↩ History to restore any prior state. Send through the workflow (Draft → Sub → Chief → Published)." },
  ];
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("re-epaper-tour-seen") === "1") return;
    setTourOpen(true);
  }, []);
  const dismissTour = () => {
    setTourOpen(false);
    localStorage.setItem("re-epaper-tour-seen", "1");
  };

  // Dark mode toggle for night-shift operators. Persists to localStorage;
  // canvas itself stays light because it represents the printed paper.
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("re-epaper-dark") : null;
    if (stored === "1") { setDarkMode(true); document.documentElement.dataset.reEpaperDark = "1"; }
  }, []);
  const toggleDark = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) { document.documentElement.dataset.reEpaperDark = "1"; localStorage.setItem("re-epaper-dark", "1"); }
    else { delete document.documentElement.dataset.reEpaperDark; localStorage.removeItem("re-epaper-dark"); }
  };

  // View mode: edit canvas / split (canvas + preview iframe) / preview-only.
  // Live preview hits /api/epaper/page/[id]/preview which reuses
  // renderLayoutToHtml — no Playwright in the hot path so it's near-instant.
  const [viewMode, setViewMode] = useState<"edit" | "split" | "preview">("edit");

  // Save-status indicator: tracks every PATCH so the operator can see whether
  // their last action persisted. Three states: saving | saved | failed.
  // The HUD ticks every 30s to refresh the "Saved Xs ago" relative timestamp.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveTick, setSaveTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSaveTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  // Block tab/close while a save is in flight — prevents data loss on
  // navigation mid-write.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveState === "saving") { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  // Undo/redo: per-page stack of prior layout snapshots. Pushed BEFORE each
  // mutation; popping pushes the popped state onto the redo stack. Capped at
  // UNDO_LIMIT entries per page to keep memory bounded.
  const UNDO_LIMIT = 50;
  const [undoStacks, setUndoStacks] = useState<Record<string, Block[][]>>({});
  const [redoStacks, setRedoStacks] = useState<Record<string, Block[][]>>({});

  const pushUndo = useCallback((pageId: string, blocks: Block[]) => {
    setUndoStacks((prev) => {
      const stack = prev[pageId] ? [...prev[pageId]] : [];
      stack.push(JSON.parse(JSON.stringify(blocks)));
      if (stack.length > UNDO_LIMIT) stack.shift();
      return { ...prev, [pageId]: stack };
    });
    // New action invalidates the redo timeline.
    setRedoStacks((prev) => ({ ...prev, [pageId]: [] }));
  }, []);

  // Optimistic-concurrency: when the server says 409 we surface a blocking
  // modal so the operator either reloads (losing local changes) or knows
  // their next save will fail too.
  const [conflict, setConflict] = useState<{ pageId: string; pageLabel: string; currentVersion: number } | null>(null);

  // Snapshot/History panel — operator opens to see point-in-time captures
  // (auto-saved before each Render / Regenerate + any manual snapshots) and
  // restore any of them. Restoring writes a pre-restore snapshot first so it's
  // itself undoable.
  interface Snapshot { id: string; reason: string; note: string | null; createdAt: string; snappedBy?: { id: string; name: string } | null }
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState("");

  const loadSnapshots = async () => {
    if (!edition) return;
    setSnapshotsLoading(true);
    try {
      const r = await fetch(`/api/epaper/snapshots?editionId=${edition.id}`);
      const data = await r.json();
      setSnapshots(data.snapshots || []);
    } finally { setSnapshotsLoading(false); }
  };

  const takeSnapshot = async () => {
    if (!edition) return;
    const r = await fetch(`/api/epaper/snapshots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editionId: edition.id, note: snapshotNote.trim() || undefined }),
    });
    if (r.ok) { setSnapshotNote(""); await loadSnapshots(); toast("success", "Snapshot saved"); }
    else toast("error", "Failed to snapshot");
  };

  const restoreSnap = async (id: string) => {
    if (!edition) return;
    if (!confirm("Restore this snapshot? Your current layout will be auto-snapshotted first so you can undo the restore from the History panel.")) return;
    const r = await fetch(`/api/epaper/snapshots/${id}/restore`, { method: "POST" });
    if (!r.ok) { toast("error", "Restore failed"); return; }
    await loadEdition(date);
    await loadSnapshots();
    toast("success", "Restored from snapshot");
  };

  // Central PATCH helper. Stamps `expectedVersion` from the current state and
  // either bumps the cached version on success or raises the conflict modal
  // on 409. Every editor mutation goes through this so we never hand-roll a
  // fetch without the concurrency token again.
  const patchPage = async (payload: object) => {
    if (!activePage) return null;
    setSaveState("saving");
    const res = await fetch(`/api/epaper/page/${activePage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, expectedVersion: activePage.version }),
    }).catch((e) => { setSaveState("failed"); throw e; });
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      setConflict({ pageId: activePage.id, pageLabel: activePage.label, currentVersion: data.currentVersion ?? -1 });
      setSaveState("failed");
      return null;
    }
    if (!res.ok) {
      setError(`Save failed (${res.status})`);
      setSaveState("failed");
      return null;
    }
    const updated = await res.json();
    setSaveState("saved");
    setLastSavedAt(Date.now());
    // Stamp the bumped version onto the local page so the next PATCH passes.
    // Defensive: only overwrite when the server actually returned a numeric
    // version — a missing field would silently disable concurrency checks.
    if (typeof updated?.version === "number") {
      setEdition((prev) => {
        if (!prev) return prev;
        return { ...prev, pages: prev.pages.map((p) =>
          p.id === activePage.id ? { ...p, version: updated.version } : p) };
      });
    }
    return updated;
  };

  const setBlockArticle = async (articleId: string | null) => {
    if (!activePage || !selectedBlockId) return;
    pushUndo(activePage.id, activePage.layout.blocks);
    const ok = await patchPage({ setArticle: { blockId: selectedBlockId, articleId } });
    if (!ok) return;
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
    pushUndo(activePage.id, activePage.layout.blocks);
    const ok = await patchPage({ setLocked: { blockId, locked: newLocked } });
    if (!ok) return;
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
    pushUndo(activePage.id, activePage.layout.blocks);
    setEdition((prev) => {
      if (!prev) return prev;
      return { ...prev, pages: prev.pages.map((p) =>
        p.id === activePage.id ? { ...p, layout: { blocks: newBlocks } } : p) };
    });
    await patchPage({ blocks: newBlocks });
  };

  const undo = useCallback(async () => {
    if (!activePage) return;
    const stack = undoStacks[activePage.id];
    if (!stack || stack.length === 0) return;
    const last = stack[stack.length - 1];
    setUndoStacks((prev) => ({ ...prev, [activePage.id]: stack.slice(0, -1) }));
    setRedoStacks((prev) => {
      const r = prev[activePage.id] ? [...prev[activePage.id]] : [];
      r.push(JSON.parse(JSON.stringify(activePage.layout.blocks)));
      if (r.length > UNDO_LIMIT) r.shift();
      return { ...prev, [activePage.id]: r };
    });
    setEdition((prev) => {
      if (!prev) return prev;
      return { ...prev, pages: prev.pages.map((p) =>
        p.id === activePage.id ? { ...p, layout: { blocks: last } } : p) };
    });
    await patchPage({ blocks: last });
  }, [activePage, undoStacks]);

  const redo = useCallback(async () => {
    if (!activePage) return;
    const stack = redoStacks[activePage.id];
    if (!stack || stack.length === 0) return;
    const next = stack[stack.length - 1];
    setRedoStacks((prev) => ({ ...prev, [activePage.id]: stack.slice(0, -1) }));
    setUndoStacks((prev) => {
      const u = prev[activePage.id] ? [...prev[activePage.id]] : [];
      u.push(JSON.parse(JSON.stringify(activePage.layout.blocks)));
      if (u.length > UNDO_LIMIT) u.shift();
      return { ...prev, [activePage.id]: u };
    });
    setEdition((prev) => {
      if (!prev) return prev;
      return { ...prev, pages: prev.pages.map((p) =>
        p.id === activePage.id ? { ...p, layout: { blocks: next } } : p) };
    });
    await patchPage({ blocks: next });
  }, [activePage, redoStacks]);

  // Per-block style panel — image position/size, text columns, headline scale,
  // colors (text/headline/headline-bg/block-bg), padding, margin.
  const [styleBlockId, setStyleBlockId] = useState<string | null>(null);
  const [styleImgPos, setStyleImgPos] = useState<"top" | "left" | "right" | "none">("top");
  const [styleImgSize, setStyleImgSize] = useState(40);
  const [styleCols, setStyleCols] = useState<1 | 2 | 3>(2);
  const [styleHlScale, setStyleHlScale] = useState(1);
  const [styleHlColor, setStyleHlColor] = useState("#14110b");
  const [styleHlBgColor, setStyleHlBgColor] = useState("");
  const [styleBlockBgColor, setStyleBlockBgColor] = useState("");
  const [styleTextColor, setStyleTextColor] = useState("#34302a");
  const [stylePadding, setStylePadding] = useState(6);
  const [styleMargin, setStyleMargin] = useState(0);
  const openStyle = (blockId: string) => {
    const b = activePage?.layout.blocks.find((x) => x.id === blockId);
    if (!b) return;
    setStyleBlockId(blockId);
    setStyleImgPos(b.style?.imagePosition ?? "top");
    setStyleImgSize(b.style?.imageSize ?? 40);
    setStyleCols((b.style?.textColumns ?? 2) as 1 | 2 | 3);
    setStyleHlScale(b.style?.hlScale ?? 1);
    setStyleHlColor(b.style?.hlColor ?? "#14110b");
    setStyleHlBgColor(b.style?.hlBgColor ?? "");
    setStyleBlockBgColor(b.style?.blockBgColor ?? "");
    setStyleTextColor(b.style?.textColor ?? "#34302a");
    setStylePadding(b.style?.padding ?? 6);
    setStyleMargin(b.style?.margin ?? 0);
  };
  const saveStyle = async () => {
    if (!activePage || !styleBlockId) return;
    const style: any = {
      imagePosition: styleImgPos, imageSize: styleImgSize,
      textColumns: styleCols, hlScale: styleHlScale,
      padding: stylePadding, margin: styleMargin,
    };
    if (styleHlColor && styleHlColor !== "#14110b") style.hlColor = styleHlColor;
    if (styleHlBgColor) style.hlBgColor = styleHlBgColor;
    if (styleBlockBgColor) style.blockBgColor = styleBlockBgColor;
    if (styleTextColor && styleTextColor !== "#34302a") style.textColor = styleTextColor;
    const blocks = activePage.layout.blocks.map((b) =>
      b.id === styleBlockId ? { ...b, style } : b
    );
    pushUndo(activePage.id, activePage.layout.blocks);
    setEdition((prev) => prev ? { ...prev, pages: prev.pages.map((p) => p.id === activePage.id ? { ...p, layout: { blocks } } : p) } : prev);
    await patchPage({ blocks });
    setStyleBlockId(null);
    toast("success", "Block style saved");
  };

  // Image crop modal — per-block fractional crop on the article's featured image.
  const [cropBlockId, setCropBlockId] = useState<string | null>(null);
  const [cropImgUrl, setCropImgUrl] = useState<string | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropDragStart = useRef<{ x: number; y: number } | null>(null);
  const openCrop = async (blockId: string) => {
    const b = activePage?.layout.blocks.find((x) => x.id === blockId);
    if (!b?.articleId) { toast("warn", "Block has no article — pick one first"); return; }
    // Look up the article's featured image; fall back to a re-fetch if not cached.
    let img: string | null = null;
    const r = await fetch(`/api/articles/${b.articleId}`);
    if (r.ok) {
      const data = await r.json();
      img = data.featuredImage || null;
    }
    if (!img) { toast("warn", "Article has no featured image"); return; }
    setCropBlockId(blockId);
    setCropImgUrl(img);
    setCropRect(b.imageCrop || { x: 0, y: 0, w: 1, h: 1 });
  };
  const cropOnDown = (e: React.MouseEvent) => {
    const r = cropImgRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    cropDragStart.current = { x, y };
    setCropRect({ x, y, w: 0, h: 0 });
  };
  const cropOnMove = (e: React.MouseEvent) => {
    if (!cropDragStart.current) return;
    const r = cropImgRef.current?.getBoundingClientRect();
    if (!r) return;
    const cx = (e.clientX - r.left) / r.width;
    const cy = (e.clientY - r.top) / r.height;
    setCropRect({
      x: Math.min(cropDragStart.current.x, cx),
      y: Math.min(cropDragStart.current.y, cy),
      w: Math.abs(cx - cropDragStart.current.x),
      h: Math.abs(cy - cropDragStart.current.y),
    });
  };
  const cropOnUp = () => { cropDragStart.current = null; };
  const saveCrop = async () => {
    if (!activePage || !cropBlockId || !cropRect) return;
    // Clamp values; if rectangle ~ full image, treat as "no crop" (remove field)
    const useCrop = cropRect.w > 0.05 && cropRect.h > 0.05;
    const blocks = activePage.layout.blocks.map((b) =>
      b.id === cropBlockId ? { ...b, imageCrop: useCrop ? cropRect : undefined } : b
    );
    pushUndo(activePage.id, activePage.layout.blocks);
    setEdition((prev) => prev ? { ...prev, pages: prev.pages.map((p) => p.id === activePage.id ? { ...p, layout: { blocks } } : p) } : prev);
    await patchPage({ blocks });
    setCropBlockId(null);
    toast("success", useCrop ? "Crop saved" : "Crop removed");
  };

  // Per-placement headline / dek override. Lets operator trim a CMS title
  // that's too long for a lead slot without editing the source article.
  const [overrideBlockId, setOverrideBlockId] = useState<string | null>(null);
  const [overrideTitle, setOverrideTitle] = useState("");
  const [overrideDek, setOverrideDek] = useState("");
  const openOverride = (blockId: string) => {
    const b = activePage?.layout.blocks.find((x) => x.id === blockId);
    if (!b) return;
    setOverrideBlockId(blockId);
    setOverrideTitle(b.overrideTitle || "");
    setOverrideDek(b.overrideDek || "");
  };
  const saveOverride = async () => {
    if (!activePage || !overrideBlockId) return;
    const blocks = activePage.layout.blocks.map((b) =>
      b.id === overrideBlockId ? { ...b, overrideTitle: overrideTitle.trim() || undefined, overrideDek: overrideDek.trim() || undefined } : b
    );
    pushUndo(activePage.id, activePage.layout.blocks);
    setEdition((prev) => prev ? { ...prev, pages: prev.pages.map((p) => p.id === activePage.id ? { ...p, layout: { blocks } } : p) } : prev);
    await patchPage({ blocks });
    setOverrideBlockId(null);
    toast("success", "Override saved");
  };

  // Help overlay (? key) listing every keyboard shortcut.
  const [helpOpen, setHelpOpen] = useState(false);

  // Comments drawer — chief editor leaves notes per page or per block.
  interface Comment { id: string; blockId: string | null; text: string; resolved: boolean; createdAt: string; author: { id: string; name: string }; pageId: string }
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentScope, setCommentScope] = useState<"page" | "block">("page");
  const loadComments = useCallback(async () => {
    if (!edition) return;
    const r = await fetch(`/api/epaper/comments?editionId=${edition.id}`);
    const data = await r.json();
    setComments(data.comments || []);
  }, [edition]);
  useEffect(() => { if (commentsOpen) loadComments(); }, [commentsOpen, loadComments]);
  const postComment = async () => {
    if (!edition || !activePage || !commentDraft.trim()) return;
    const r = await fetch("/api/epaper/comments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        editionId: edition.id,
        pageId: activePage.id,
        blockId: commentScope === "block" ? selectedBlockId : null,
        text: commentDraft,
      }),
    });
    if (r.ok) { setCommentDraft(""); await loadComments(); toast("success", "Comment posted"); }
    else toast("error", "Comment failed");
  };
  const toggleResolved = async (id: string, resolved: boolean) => {
    const r = await fetch(`/api/epaper/comments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    if (r.ok) await loadComments();
  };
  const deleteComment = async (id: string) => {
    const r = await fetch(`/api/epaper/comments/${id}`, { method: "DELETE" });
    if (r.ok) await loadComments();
  };

  // For the page-tab badge: count unresolved comments per page.
  const commentsByPage = comments.reduce<Record<string, number>>((acc, c) => {
    if (!c.resolved) acc[c.pageId] = (acc[c.pageId] || 0) + 1;
    return acc;
  }, {});

  // Wire Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y to undo/redo, ? for help, Esc to dismiss.
  // Skip when focus is in an input/textarea so the operator's typing isn't hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement | null)?.tagName === "INPUT"
        || (e.target as HTMLElement | null)?.tagName === "TEXTAREA";
      if (inField) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault(); undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
        e.preventDefault(); redo();
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault(); setHelpOpen(true);
      } else if (e.key === "Escape") {
        setHelpOpen(false); setConflict(null); setInsertOpen(false); setHistoryOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <Sidebar />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      {/* Block style panel — image + columns + headline + colors + spacing */}
      {styleBlockId && (
        <div onClick={() => setStyleBlockId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 10, padding: 22, maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>🎨 Block style</h2>

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Image position</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {(["top", "left", "right", "none"] as const).map((p) => (
                <button key={p} onClick={() => setStyleImgPos(p)}
                  style={{ flex: 1, padding: "8px", background: styleImgPos === p ? "#7c3aed" : "#f3f4f6", color: styleImgPos === p ? "#fff" : "#374151", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
                  {p}
                </button>
              ))}
            </div>

            {(styleImgPos === "left" || styleImgPos === "right") && (
              <>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Image size: {styleImgSize}% of block width</label>
                <input type="range" min="10" max="70" step="5" value={styleImgSize}
                  onChange={(e) => setStyleImgSize(parseInt(e.target.value, 10))}
                  style={{ width: "100%", marginBottom: 12 }} />
              </>
            )}

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Text columns</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {([1, 2, 3] as const).map((c) => (
                <button key={c} onClick={() => setStyleCols(c)}
                  style={{ flex: 1, padding: "8px", background: styleCols === c ? "#7c3aed" : "#f3f4f6", color: styleCols === c ? "#fff" : "#374151", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {c}-col
                </button>
              ))}
            </div>

            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Headline scale: {styleHlScale.toFixed(2)}×</label>
            <input type="range" min="0.75" max="2" step="0.05" value={styleHlScale}
              onChange={(e) => setStyleHlScale(parseFloat(e.target.value))}
              style={{ width: "100%", marginBottom: 12 }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Headline text color</label>
                <input type="color" value={styleHlColor} onChange={(e) => setStyleHlColor(e.target.value)} style={{ width: "100%", height: 32, border: "1px solid #ddd", borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Headline panel bg</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="color" value={styleHlBgColor || "#ffffff"} onChange={(e) => setStyleHlBgColor(e.target.value)} style={{ flex: 1, height: 32, border: "1px solid #ddd", borderRadius: 4 }} />
                  <button onClick={() => setStyleHlBgColor("")} title="Clear" style={{ padding: "0 8px", background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✕</button>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Body text color</label>
                <input type="color" value={styleTextColor} onChange={(e) => setStyleTextColor(e.target.value)} style={{ width: "100%", height: 32, border: "1px solid #ddd", borderRadius: 4 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Block background</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <input type="color" value={styleBlockBgColor || "#ffffff"} onChange={(e) => setStyleBlockBgColor(e.target.value)} style={{ flex: 1, height: 32, border: "1px solid #ddd", borderRadius: 4 }} />
                  <button onClick={() => setStyleBlockBgColor("")} title="Clear" style={{ padding: "0 8px", background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✕</button>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Padding (px): {stylePadding}</label>
                <input type="range" min="0" max="40" step="2" value={stylePadding} onChange={(e) => setStylePadding(parseInt(e.target.value, 10))} style={{ width: "100%" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Margin (px): {styleMargin}</label>
                <input type="range" min="0" max="40" step="2" value={styleMargin} onChange={(e) => setStyleMargin(parseInt(e.target.value, 10))} style={{ width: "100%" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setStyleBlockId(null)}
                style={{ padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={saveStyle}
                style={{ padding: "8px 16px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Save style
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Image crop modal */}
      {cropBlockId && cropImgUrl && (
        <div onClick={() => setCropBlockId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 10, padding: 22, maxWidth: 720, width: "100%" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>✂ Crop image</h2>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              Drag a rectangle on the image to define the crop. The block will fill itself with this region.
            </p>
            <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
              <img ref={cropImgRef} src={cropImgUrl} alt=""
                onMouseDown={cropOnDown} onMouseMove={cropOnMove} onMouseUp={cropOnUp}
                draggable={false}
                style={{ maxWidth: "100%", maxHeight: "60vh", cursor: "crosshair", userSelect: "none", display: "block" }} />
              {cropRect && cropImgRef.current && (
                <div style={{
                  position: "absolute",
                  left: `${cropRect.x * 100}%`, top: `${cropRect.y * 100}%`,
                  width: `${cropRect.w * 100}%`, height: `${cropRect.h * 100}%`,
                  border: "2px dashed #FFD400", background: "rgba(255,212,0,0.2)",
                  pointerEvents: "none",
                }} />
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={async () => {
                  const r = await fetch("/api/epaper/smart-crop", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imageUrl: cropImgUrl }),
                  });
                  if (r.status === 503) { toast("warn", "Smart-crop disabled — Azure Vision key not set"); return; }
                  if (!r.ok) { toast("error", "Smart-crop failed"); return; }
                  const data = await r.json();
                  setCropRect(data.crop);
                  toast("success", "Auto-cropped to subject");
                }}
                style={{ padding: "8px 14px", background: "#ecfdf5", color: "#047857", border: "1px solid #6ee7b7", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                🤖 Auto-crop
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setCropRect({ x: 0, y: 0, w: 1, h: 1 }); }}
                  style={{ padding: "8px 16px", background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Reset
                </button>
                <button onClick={() => setCropBlockId(null)}
                  style={{ padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={saveCrop}
                  style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Save crop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Headline / dek override modal */}
      {overrideBlockId && (
        <div onClick={() => setOverrideBlockId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 10, padding: 22, maxWidth: 540, width: "100%" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>✎ Override headline / dek</h2>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              Only this e-paper placement uses these texts; the source article is untouched.
              Leave blank to fall back to article.title / article.summary.
            </p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Override headline</label>
            <input value={overrideTitle} onChange={(e) => setOverrideTitle(e.target.value)}
              placeholder="(falls back to article title)"
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 12, boxSizing: "border-box" }} />
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Override dek / summary</label>
            <textarea value={overrideDek} onChange={(e) => setOverrideDek(e.target.value)}
              rows={4}
              placeholder="(falls back to article summary)"
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 16, boxSizing: "border-box", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setOverrideBlockId(null)}
                style={{ padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={saveOverride}
                style={{ padding: "8px 16px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Save override
              </button>
            </div>
          </div>
        </div>
      )}
      {/* First-time walkthrough tour */}
      {tourOpen && (
        <div onClick={dismissTour}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 520, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.45)" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Step {tourStep + 1} / {TOUR_STEPS.length}</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#4f46e5", marginBottom: 10 }}>{TOUR_STEPS[tourStep].title}</h2>
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.55, marginBottom: 24 }}>{TOUR_STEPS[tourStep].body}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <button onClick={dismissTour}
                style={{ padding: "8px 14px", background: "transparent", color: "#6b7280", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Skip tour
              </button>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setTourStep((s) => Math.max(0, s - 1))} disabled={tourStep === 0}
                  style={{ padding: "8px 14px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: tourStep === 0 ? "not-allowed" : "pointer", opacity: tourStep === 0 ? 0.4 : 1 }}>
                  ← Back
                </button>
                {tourStep < TOUR_STEPS.length - 1 ? (
                  <button onClick={() => setTourStep((s) => s + 1)}
                    style={{ padding: "8px 18px", background: "#4f46e5", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Next →
                  </button>
                ) : (
                  <button onClick={dismissTour}
                    style={{ padding: "8px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Got it ✓
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {helpOpen && (
        <div onClick={() => setHelpOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 480, width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Keyboard shortcuts</h2>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["Ctrl + Z", "Undo last block change"],
                  ["Ctrl + Shift + Z  /  Ctrl + Y", "Redo"],
                  ["?", "Open this help"],
                  ["Esc", "Close any open modal / drawer"],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "monospace", color: "#4f46e5", fontWeight: 700 }}>{k}</td>
                    <td style={{ padding: "8px 0", color: "#374151" }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: "#888", marginTop: 14 }}>Drag blocks by their body; resize from the bottom-right corner. Click a story block to swap article.</p>
          </div>
        </div>
      )}
      {/* Night-shift dark mode — chrome only, page canvas stays light. */}
      <style>{`
        html[data-re-epaper-dark="1"] main { background: #0f172a !important; }
        html[data-re-epaper-dark="1"] aside,
        html[data-re-epaper-dark="1"] section { background: #1e293b !important; color: #e5e7eb !important; }
        html[data-re-epaper-dark="1"] h1,
        html[data-re-epaper-dark="1"] h2,
        html[data-re-epaper-dark="1"] h3 { color: #f1f5f9 !important; }
      `}</style>
      {/* Conflict modal — shown when the server returns 409 (another editor
          touched this page). Reload reloads the whole edition (loses local
          unsaved changes); Cancel just dismisses (next save will 409 again). */}
      {/* Insert new page modal */}
      {insertOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setInsertOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 10, padding: 22, maxWidth: 480, width: "100%" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Insert new page</h2>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              Will be inserted after page {activePage?.pageNumber ?? "(end)"}.
            </p>
            <select value={insertTemplate} onChange={(e) => setInsertTemplate(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}>
              <option value="">Pick a template…</option>
              {templateOptions.map((t) => (
                <option key={t.slug} value={t.slug}>{t.type} — {t.name}</option>
              ))}
            </select>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setInsertOpen(false)}
                style={{ padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={insertPage} disabled={!insertTemplate}
                style={{ padding: "8px 16px", background: insertTemplate ? "#4f46e5" : "#c7d2fe", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: insertTemplate ? "pointer" : "not-allowed" }}>
                Insert
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Comments drawer */}
      {commentsOpen && edition && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999 }}
          onClick={() => setCommentsOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 440, background: "#fff", padding: 20, overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>💬 Comments</h2>
              <button onClick={() => setCommentsOpen(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>✕</button>
            </div>
            <div style={{ background: "#f9fafb", padding: 12, borderRadius: 8, marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 6, fontSize: 11 }}>
                <button onClick={() => setCommentScope("page")}
                  style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: "none", background: commentScope === "page" ? "#0891b2" : "#e5e7eb", color: commentScope === "page" ? "#fff" : "#374151", cursor: "pointer", fontWeight: 700 }}>
                  This page
                </button>
                <button onClick={() => setCommentScope("block")} disabled={!selectedBlockId}
                  style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: "none", background: commentScope === "block" ? "#0891b2" : selectedBlockId ? "#e5e7eb" : "#f3f4f6", color: commentScope === "block" ? "#fff" : selectedBlockId ? "#374151" : "#9ca3af", cursor: selectedBlockId ? "pointer" : "not-allowed", fontWeight: 700 }}>
                  Selected block {selectedBlockId ? "" : "(none)"}
                </button>
              </div>
              <textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add a comment…"
                rows={3}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 8, boxSizing: "border-box", resize: "vertical" }} />
              <button onClick={postComment} disabled={!commentDraft.trim()}
                style={{ width: "100%", padding: "8px 12px", background: commentDraft.trim() ? "#0891b2" : "#bae6fd", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: commentDraft.trim() ? "pointer" : "not-allowed" }}>
                Post
              </button>
            </div>
            {comments.length === 0 && (
              <p style={{ fontSize: 12, color: "#888" }}>No comments yet. Add one above.</p>
            )}
            {comments.map((c) => {
              const onPage = edition.pages.find((p) => p.id === c.pageId);
              return (
                <div key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 10, marginBottom: 8, opacity: c.resolved ? 0.5 : 1 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
                    <b style={{ color: "#111" }}>{c.author.name}</b> · {new Date(c.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })} ·
                    {onPage ? ` page ${onPage.pageNumber}` : " page ?"}
                    {c.blockId && ` · block ${c.blockId}`}
                  </div>
                  <div style={{ fontSize: 13, color: "#111", marginBottom: 6, whiteSpace: "pre-wrap" }}>{c.text}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => toggleResolved(c.id, !c.resolved)}
                      style={{ padding: "4px 8px", background: c.resolved ? "#fff" : "#dcfce7", color: c.resolved ? "#6b7280" : "#166534", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {c.resolved ? "Reopen" : "✓ Resolve"}
                    </button>
                    <button onClick={() => deleteComment(c.id)}
                      style={{ padding: "4px 8px", background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* History drawer — sliding panel on the right with snapshot list. */}
      {historyOpen && edition && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 999 }}
          onClick={() => setHistoryOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 420, background: "#fff", padding: 20, overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>Snapshots / History</h2>
              <button onClick={() => setHistoryOpen(false)}
                style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280" }}>✕</button>
            </div>
            <div style={{ background: "#f9fafb", padding: 12, borderRadius: 8, marginBottom: 14 }}>
              <input value={snapshotNote} onChange={(e) => setSnapshotNote(e.target.value)}
                placeholder='Optional note: "before homepage swap"'
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }} />
              <button onClick={takeSnapshot}
                style={{ width: "100%", padding: "8px 12px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                📷 Snapshot now
              </button>
            </div>
            {snapshotsLoading && <p style={{ fontSize: 12, color: "#888" }}>Loading…</p>}
            {!snapshotsLoading && snapshots.length === 0 && (
              <p style={{ fontSize: 12, color: "#888" }}>No snapshots yet. One will be auto-created next time you Render or Regenerate.</p>
            )}
            {snapshots.map((s) => (
              <div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>
                      {reasonLabel(s.reason)}
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      {new Date(s.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                      {s.snappedBy?.name && ` · ${s.snappedBy.name}`}
                    </div>
                    {s.note && <div style={{ fontSize: 12, color: "#374151", marginTop: 4, fontStyle: "italic" }}>"{s.note}"</div>}
                  </div>
                  <button onClick={() => restoreSnap(s.id)}
                    style={{ padding: "5px 10px", background: "#fff", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {conflict && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 10, padding: 24, maxWidth: 460, width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#dc2626", marginBottom: 10 }}>⚠ Page changed by another editor</h2>
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.5, marginBottom: 16 }}>
              <b>{conflict.pageLabel}</b> was saved by someone else after you loaded it.
              Your last save was rejected to prevent overwriting their changes.
              Reload to see the latest version (you will lose any unsaved edits on this page).
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConflict(null)}
                style={{ padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Keep editing (next save will fail)
              </button>
              <button onClick={async () => { setConflict(null); await loadEdition(date); }}
                style={{ padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Reload page
              </button>
            </div>
          </div>
        </div>
      )}
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
          {edition && (
            <button onClick={() => { setHistoryOpen(true); loadSnapshots(); }}
              style={{ padding: "8px 16px", background: "#fff", color: "#7c3aed", border: "1px solid #7c3aed", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ↩ History
            </button>
          )}
          {edition && (
            <button onClick={() => setCommentsOpen(true)}
              style={{ padding: "8px 16px", background: "#fff", color: "#0891b2", border: "1px solid #0891b2", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              💬 Comments {comments.filter((c) => !c.resolved).length > 0 ? `(${comments.filter((c) => !c.resolved).length})` : ""}
            </button>
          )}
          <button onClick={toggleDark} title="Toggle dark mode"
            style={{ padding: "6px 10px", background: "transparent", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
            {darkMode ? "☀️" : "🌙"}
          </button>
          {activePage && (
            <div style={{ display: "inline-flex", border: "1px solid #d1d5db", borderRadius: 8, overflow: "hidden" }}>
              {(["edit", "split", "preview"] as const).map((m) => (
                <button key={m} onClick={() => setViewMode(m)}
                  style={{ padding: "6px 12px", background: viewMode === m ? "#4f46e5" : "#fff", color: viewMode === m ? "#fff" : "#374151", border: "none", borderRight: m !== "preview" ? "1px solid #d1d5db" : "none", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
                  {m}
                </button>
              ))}
            </div>
          )}
          {activePage && (
            <>
              <button onClick={undo} disabled={!undoStacks[activePage.id]?.length}
                title="Undo (Ctrl+Z)"
                style={{ padding: "8px 12px", background: undoStacks[activePage.id]?.length ? "#fff" : "#f3f4f6", color: undoStacks[activePage.id]?.length ? "#111" : "#9ca3af", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: undoStacks[activePage.id]?.length ? "pointer" : "not-allowed" }}>
                ↶ Undo {undoStacks[activePage.id]?.length ? `(${undoStacks[activePage.id].length})` : ""}
              </button>
              <button onClick={redo} disabled={!redoStacks[activePage.id]?.length}
                title="Redo (Ctrl+Shift+Z)"
                style={{ padding: "8px 12px", background: redoStacks[activePage.id]?.length ? "#fff" : "#f3f4f6", color: redoStacks[activePage.id]?.length ? "#111" : "#9ca3af", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: redoStacks[activePage.id]?.length ? "pointer" : "not-allowed" }}>
                ↷ Redo {redoStacks[activePage.id]?.length ? `(${redoStacks[activePage.id].length})` : ""}
              </button>
            </>
          )}
          {edition && (
            <span title={edition.workflowNote ? `Last note: ${edition.workflowNote}` : ""}
              style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: WORKFLOW_COLOR[edition.workflowState] + "22", color: WORKFLOW_COLOR[edition.workflowState] }}>
              {WORKFLOW_LABEL[edition.workflowState]}
            </span>
          )}
          {peers.length > 1 && (
            <span title={peers.map((p) => `${p.userName}${p.pageId ? ` (page ${edition?.pages.find((x) => x.id === p.pageId)?.pageNumber ?? "?"})` : ""}`).join("\n")}
              style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "#dcfce7", color: "#166534" }}>
              👥 {peers.length} editors
            </span>
          )}
          {edition && (NEXT_STATES[edition.workflowState] || []).map((opt) => (
            <button key={opt.to} onClick={() => transitionTo(opt.to, opt.label, !!opt.needNote)}
              style={{ padding: "6px 12px", background: opt.danger ? "#fee2e2" : "#ede9fe", color: opt.danger ? "#991b1b" : "#5b21b6", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {opt.label}
            </button>
          ))}
          <span style={{ fontSize: 12, color: "#888" }}>Render: <b>{edition?.status || "—"}</b></span>
          <SaveBadge state={saveState} lastSavedAt={lastSavedAt} tick={saveTick} />
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
            <aside style={{ width: 240, background: "#fff", borderRadius: 8, padding: 12, overflowY: "auto" }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#555", marginBottom: 8 }}>PAGES</h3>
              {edition.pages.map((p, i) => {
                const isActive = i === activePageIdx;
                // Compute per-page health: how many story slots empty vs filled,
                // and whether any block is locked. Operator can scan the list
                // at a glance.
                const storyBlocks = p.layout.blocks.filter((b) => STORY_TYPES.has(b.type));
                const emptyCount = storyBlocks.filter((b) => !b.articleId).length;
                const lockedCount = p.layout.blocks.filter((b) => b.locked).length;
                return (
                  <div key={p.id} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <button onClick={() => { setActivePageIdx(i); setSelectedBlockId(null); }}
                      style={{
                        flex: 1, textAlign: "left", padding: "8px 10px",
                        border: "none", borderRadius: 6, cursor: "pointer",
                        background: isActive ? "#4f46e5" : "transparent",
                        color: isActive ? "#fff" : "#111",
                        fontSize: 12, fontWeight: 600, minWidth: 0,
                      }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.pageNumber}. {p.label}
                      </div>
                      <div style={{ display: "flex", gap: 6, fontSize: 10, marginTop: 3, color: isActive ? "rgba(255,255,255,0.85)" : "#6b7280" }}>
                        {emptyCount > 0
                          ? <span title={`${emptyCount} empty story block${emptyCount > 1 ? "s" : ""}`}>⚠ {emptyCount}</span>
                          : <span title="All story blocks filled">✓</span>}
                        {lockedCount > 0 && <span title={`${lockedCount} locked block${lockedCount > 1 ? "s" : ""}`}>🔒 {lockedCount}</span>}
                        {commentsByPage[p.id] > 0 && <span title={`${commentsByPage[p.id]} open comments`}>💬 {commentsByPage[p.id]}</span>}
                        {peers.filter((peer) => peer.pageId === p.id && peer.userId !== "you").length > 0 && (
                          <span title={peers.filter((peer) => peer.pageId === p.id).map((peer) => peer.userName).join(", ")}>
                            👥 {peers.filter((peer) => peer.pageId === p.id).length}
                          </span>
                        )}
                      </div>
                    </button>
                    <button onClick={() => duplicatePage(p.id)} title="Duplicate page"
                      style={{ padding: "4px 6px", background: "transparent", border: "none", cursor: "pointer", color: isActive ? "#fff" : "#9ca3af", fontSize: 13 }}>⎘</button>
                    <button onClick={() => deletePage(p.id, p.label)} title="Delete page"
                      style={{ padding: "4px 6px", background: "transparent", border: "none", cursor: "pointer", color: isActive ? "#fff" : "#9ca3af", fontSize: 13 }}>🗑</button>
                  </div>
                );
              })}
              <button onClick={() => { setInsertOpen(true); loadTemplateOptions(); }}
                style={{ width: "100%", marginTop: 8, padding: "8px 10px", background: "#fff", color: "#4f46e5", border: "1px dashed #4f46e5", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                + New Page
              </button>
            </aside>

            {/* Page canvas + (optionally) live preview iframe */}
            <section style={{ flex: 1, background: "#fff", borderRadius: 8, padding: 16, overflow: "auto", display: "flex", flexDirection: "column", minWidth: 0 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#555", marginBottom: 10 }}>
                Page {activePage?.pageNumber} · {activePage?.label} · template: <code style={{ fontSize: 11 }}>{activePage?.templateSlug}</code>
              </h3>
              {activePage && (
                <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
                  {(viewMode === "edit" || viewMode === "split") && (
                    <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
                      {selectedBlockIds.size > 1 && (
                        <div style={{ background: "#eef2ff", padding: 8, borderRadius: 6, marginBottom: 8, display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: "#3730a3" }}>{selectedBlockIds.size} blocks selected</span>
                          <div style={{ flex: 1 }} />
                          <button onClick={async () => {
                              const ids = Array.from(selectedBlockIds);
                              for (const id of ids) {
                                const b = activePage.layout.blocks.find((x) => x.id === id);
                                if (b && !b.locked) await toggleLock(id);
                              }
                              toast("success", `Locked ${ids.length} blocks`);
                            }}
                            style={{ padding: "4px 10px", background: "#fbbf24", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            🔒 Lock all
                          </button>
                          <button onClick={async () => {
                              const ids = Array.from(selectedBlockIds);
                              for (const id of ids) {
                                const b = activePage.layout.blocks.find((x) => x.id === id);
                                if (b && b.locked) await toggleLock(id);
                              }
                              toast("success", `Unlocked ${ids.length} blocks`);
                            }}
                            style={{ padding: "4px 10px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            🔓 Unlock all
                          </button>
                          <button onClick={async () => {
                              const ids = Array.from(selectedBlockIds);
                              for (const id of ids) {
                                setSelectedBlockId(id);
                                await new Promise((r) => setTimeout(r, 20));
                                await setBlockArticle(null);
                              }
                              toast("success", `Cleared ${ids.length} blocks`);
                              setSelectedBlockIds(new Set());
                            }}
                            style={{ padding: "4px 10px", background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            ✕ Clear articles
                          </button>
                          <button onClick={() => setSelectedBlockIds(new Set())}
                            style={{ padding: "4px 10px", background: "transparent", color: "#3730a3", border: "1px solid #c7d2fe", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Deselect
                          </button>
                        </div>
                      )}
                      <DraggableBlockGrid
                        layout={activePage.layout}
                        titles={titles}
                        selectedBlockId={selectedBlockId}
                        multiSelected={selectedBlockIds}
                        onSelect={(id, e) => {
                          if (e?.shiftKey) {
                            setSelectedBlockIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            });
                          } else {
                            setSelectedBlockId(id);
                            setSelectedBlockIds(new Set([id]));
                          }
                        }}
                        onToggleLock={toggleLock}
                        onLayoutChange={saveLayout}
                      />
                    </div>
                  )}
                  {(viewMode === "split" || viewMode === "preview") && (
                    <div style={{ flex: 1, minWidth: 0, border: "1px solid #e5e7eb", borderRadius: 6, background: "#FCFAF3", overflow: "hidden" }}>
                      <iframe
                        title="Live preview"
                        src={`/api/epaper/page/${activePage.id}/preview?v=${activePage.version}`}
                        style={{ width: "100%", height: "100%", border: "none", background: "#FCFAF3" }}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Article picker — chip-based filters so the operator can SEE every
                rule the slot has + untick to widen the search. */}
            <aside style={{ width: 320, background: "#fff", borderRadius: 8, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: "#555" }}>ARTICLE PICKER</h3>
              {!selectedBlockId && <p style={{ fontSize: 12, color: "#888" }}>Click a story block on the page to pick an article.</p>}
              {selectedBlockId && (
                <>
                  <input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)}
                    placeholder="Search title…"
                    style={{ width: "100%", padding: "8px 10px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }} />

                  {/* Time window */}
                  <ChipRow label="TIME">
                    {[
                      { v: 1, label: "24h" },
                      { v: 7, label: "7 days" },
                      { v: 30, label: "30 days" },
                      { v: 90, label: "90 days" },
                      { v: 365, label: "1 year" },
                    ].map((opt) => (
                      <Chip key={opt.v} active={pickerFilters.windowDays === opt.v}
                        onClick={() => setPickerFilters((f) => ({ ...f, windowDays: opt.v }))}>
                        {opt.label}
                      </Chip>
                    ))}
                  </ChipRow>

                  {/* Sort */}
                  <ChipRow label="SORT">
                    {([
                      ["newest", "Newest"],
                      ["views", "Most read"],
                      ["breaking", "Breaking"],
                      ["featured", "Featured"],
                    ] as Array<[SortKey, string]>).map(([k, label]) => (
                      <Chip key={k} active={pickerFilters.sort === k}
                        onClick={() => setPickerFilters((f) => ({ ...f, sort: k }))}>
                        {label}
                      </Chip>
                    ))}
                  </ChipRow>

                  {/* Slot-derived chips that operator can disable */}
                  <ChipRow label="FILTERS">
                    {pickerFilters.categorySlug && (
                      <Chip active onClick={() => setPickerFilters((f) => ({ ...f, categorySlug: "" }))}>
                        {pickerFilters.categorySlug} ✕
                      </Chip>
                    )}
                    {pickerFilters.districtSlug && (
                      <Chip active onClick={() => setPickerFilters((f) => ({ ...f, districtSlug: "" }))}>
                        {pickerFilters.districtSlug} ✕
                      </Chip>
                    )}
                    <Chip active={pickerFilters.hasImage}
                      onClick={() => setPickerFilters((f) => ({ ...f, hasImage: !f.hasImage }))}>
                      📷 Has image
                    </Chip>
                    <Chip active={pickerFilters.breaking}
                      onClick={() => setPickerFilters((f) => ({ ...f, breaking: !f.breaking }))}>
                      ⚡ Breaking
                    </Chip>
                    <Chip active={pickerFilters.featured}
                      onClick={() => setPickerFilters((f) => ({ ...f, featured: !f.featured }))}>
                      ⭐ Featured
                    </Chip>
                  </ChipRow>

                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setBlockArticle(null)}
                      style={{ flex: 1, padding: "8px 8px", background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Clear
                    </button>
                    <button onClick={() => selectedBlockId && openOverride(selectedBlockId)}
                      disabled={!selectedBlockId}
                      style={{ flex: 1, padding: "8px 8px", background: "#fef3c7", color: "#92400e", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: selectedBlockId ? "pointer" : "not-allowed" }}>
                      ✎ Text
                    </button>
                    <button onClick={() => selectedBlockId && openCrop(selectedBlockId)}
                      disabled={!selectedBlockId}
                      style={{ flex: 1, padding: "8px 8px", background: "#dbeafe", color: "#1e40af", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: selectedBlockId ? "pointer" : "not-allowed" }}>
                      ✂ Crop
                    </button>
                    <button onClick={() => selectedBlockId && openStyle(selectedBlockId)}
                      disabled={!selectedBlockId}
                      style={{ flex: 1, padding: "8px 8px", background: "#f3e8ff", color: "#6b21a8", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: selectedBlockId ? "pointer" : "not-allowed" }}>
                      🎨 Style
                    </button>
                    <button onClick={() => setPickerFilters({ ...DEFAULT_FILTERS, windowDays: pickerFilters.windowDays, sort: pickerFilters.sort })}
                      style={{ flex: 1, padding: "8px 8px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Reset
                    </button>
                  </div>

                  <p style={{ fontSize: 11, color: "#666", margin: 0 }}>
                    <b>{pickerArticles.length}</b> match · {pickerTotal} published in {pickerFilters.windowDays}d window
                  </p>

                  {pickerArticles.length === 0 && pickerTotal > 0 && (
                    <div style={{ padding: 10, background: "#fef3c7", color: "#92400e", borderRadius: 6, fontSize: 12 }}>
                      Filters hide all {pickerTotal} articles. Untick a chip above to widen, or extend the time window.
                    </div>
                  )}
                  {pickerTotal === 0 && (
                    <div style={{ padding: 10, background: "#fef3c7", color: "#92400e", borderRadius: 6, fontSize: 12 }}>
                      No articles published in the last {pickerFilters.windowDays} days. Try a longer window.
                    </div>
                  )}

                  {pickerArticles.map((a) => (
                    <button key={a.id} onClick={() => setBlockArticle(a.id)}
                      style={{ width: "100%", textAlign: "left", padding: 8, border: "1px solid #eee", borderRadius: 6, cursor: "pointer", background: "#fafafa", fontSize: 12, display: "flex", gap: 8 }}>
                      {a.featuredImage ? (
                        <img src={a.featuredImage} alt="" style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 46, height: 46, background: "#e5e7eb", borderRadius: 4, flexShrink: 0 }} />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, lineHeight: 1.3, marginBottom: 2 }}>{a.title.slice(0, 90)}</div>
                        <div style={{ color: "#888", fontSize: 10, display: "flex", gap: 6 }}>
                          <span>{a.category.name}</span>
                          {a.breaking && <span style={{ color: "#dc2626", fontWeight: 700 }}>⚡</span>}
                          {a.featured && <span style={{ color: "#f59e0b" }}>⭐</span>}
                          {typeof a.viewCount === "number" && a.viewCount > 0 && <span>{a.viewCount.toLocaleString()} views</span>}
                        </div>
                      </div>
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

function reasonLabel(r: string): string {
  switch (r) {
    case "manual": return "📷 Manual snapshot";
    case "pre-render": return "🖨 Before PDF render";
    case "pre-regenerate": return "♻ Before regenerate";
    case "pre-restore": return "↩ Before previous restore";
    default: return r;
  }
}

/** Top-bar save status. The `tick` prop forces a re-render every 30s so the
 *  "Saved Xs ago" timestamp stays fresh without a per-second timer. */
function SaveBadge({ state, lastSavedAt, tick: _tick }: { state: "idle" | "saving" | "saved" | "failed"; lastSavedAt: number | null; tick: number }) {
  if (state === "idle" && !lastSavedAt) return null;
  const base: React.CSSProperties = { fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6 };
  if (state === "saving") return <span style={{ ...base, background: "#dbeafe", color: "#1e40af" }}>⚪ Saving…</span>;
  if (state === "failed") return <span style={{ ...base, background: "#fee2e2", color: "#991b1b" }}>⚠ Save failed</span>;
  // saved or idle-with-prior-save
  return <span style={{ ...base, background: "#dcfce7", color: "#166534" }}>✓ Saved {lastSavedAt ? relTime(lastSavedAt) : ""}</span>;
}

function relTime(t: number): string {
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 5) return "now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
        border: active ? "1px solid #4f46e5" : "1px solid #d1d5db",
        background: active ? "#4f46e5" : "#fff",
        color: active ? "#fff" : "#4b5563",
        cursor: "pointer",
      }}>
      {children}
    </button>
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
  layout, titles, selectedBlockId, multiSelected, onSelect, onToggleLock, onLayoutChange,
}: {
  layout: { blocks: Block[] };
  titles: Record<string, string>;
  selectedBlockId: string | null;
  multiSelected?: Set<string>;
  onSelect: (id: string, e?: React.MouseEvent) => void;
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

  // Visual snap guides — vertical lines at each column boundary, horizontal
  // lines at each row. Pure CSS background so it doesn't interact with RGL's
  // own drag/resize.
  const colPx = (GRID_WIDTH - 16) / COLS;
  const guideBg = `repeating-linear-gradient(to right, rgba(79,70,229,0.08) 0, rgba(79,70,229,0.08) 1px, transparent 1px, transparent ${colPx}px),`
                + ` repeating-linear-gradient(to bottom, rgba(79,70,229,0.06) 0, rgba(79,70,229,0.06) 1px, transparent 1px, transparent ${ROW_H}px)`;

  return (
    <div style={{ background: "#fafafa", borderRadius: 6, padding: 8, backgroundImage: guideBg, backgroundSize: `${colPx}px ${ROW_H}px`, backgroundPosition: "8px 8px" }}>
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
          const isMulti = !!multiSelected?.has(b.id);
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
              onClick={(e) => isStory && onSelect(b.id, e)}
              style={{
                background: bg, color,
                border: isMulti ? "3px solid #4f46e5" : isSelected ? "2px solid #4f46e5" : "1px solid #e5e7eb",
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
