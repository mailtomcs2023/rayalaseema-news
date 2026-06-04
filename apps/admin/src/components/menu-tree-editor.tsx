// Menu tree editor (Spec #3 C1-C3 #178-#180 + D1 #181).
// 3-pane shell: palette (4 target type adders), tree, config panel.
// Depth capped at 2 (top item + children). Auto-save draft debounced 5s.
// Publish copies draftItems -> items + snapshots a MenuVersion.
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useKycGate } from "@/components/kyc-gated-link";
import { confirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash, ChevronsUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WithTooltip } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  MeasuringStrategy,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  flattenTree,
  buildTree,
  getProjection,
  removeChildrenOf,
  getChildCount,
  removeItemById,
  patchItemById,
  findItemDeep,
  sanitizeTree,
  type Item,
  type Target,
  type FlattenedItem,
} from "./menu-tree-dnd";

const INDENT = 28; // px per nesting level in the tree pane

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
  // Spec #3 F1 #185 - broken-link detection. Pre-computed sets of currently
  // valid CATEGORY slugs and CONTENT ids referenced by this menu. Any item
  // whose target points outside these sets gets a ⚠ icon + banner.
  validCategorySlugs: string[];
  validContentIds: string[];
  // Display name of the logged-in editor, used by presence heartbeats.
  currentUserName: string;
}

function genId() {
  return "itm_" + Math.random().toString(36).slice(2, 11);
}

// Turn a 400 response body ({ error, fieldErrors }) from the draft/publish
// routes into a readable message. Zod's array fieldErrors are keyed by top-
// level item index, so surface which item failed instead of a generic
// "Invalid menu shape".
function formatSaveError(data: any, status: number): string {
  const base = data?.error || `Save failed (${status})`;
  const fe = data?.fieldErrors;
  if (fe && typeof fe === "object") {
    const parts = Object.entries(fe)
      .map(([idx, msgs]) => {
        const n = Number(idx);
        const where = Number.isInteger(n) ? `Item #${n + 1}` : idx;
        const msg = Array.isArray(msgs) ? msgs.join(", ") : String(msgs);
        return `${where}: ${msg}`;
      })
      .slice(0, 4);
    if (parts.length) return `${base} - ${parts.join("; ")}`;
  }
  return base;
}

export function MenuTreeEditor(props: Props) {
  const router = useRouter();
  // KYC gate - every tree mutation flows through `update()` below, so a
  // single check at that chokepoint covers Add item + per-item edits +
  // remove. Publish has its own button so it's gated separately. ADMIN
  // bypasses (useKycGate returns blocked=false for them).
  const { blocked: kycBlocked, kycStatus: gateKycStatus } = useKycGate();
  const fireKycToast = (action = "edit the menu") => {
    toast.error(`Your KYC must be verified to ${action}.`, {
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
  const [tree, setTree] = useState<Item[]>(props.items);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // dnd-kit drag state.
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  // The DragOverlay portals into document.body, which doesn't exist during SSR.
  // Render it only after mount on the client.
  const [mounted, setMounted] = useState(false);
  // Editor-only accordion state - which parent rows are collapsed. Kept OUT of
  // the published menu (the menu schema is strict), but persisted per-location
  // to localStorage so the collapsed/expanded layout survives navigation and
  // reloads. Restored after mount (effect below) so the first client render
  // still matches the server (all-expanded) and hydration stays clean.
  const collapseStorageKey = `rsn-menu-collapsed:${props.location}`;
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const persistCollapsed = useCallback(
    (next: Set<string>) => {
      try { localStorage.setItem(collapseStorageKey, JSON.stringify([...next])); } catch { /* storage full / disabled */ }
    },
    [collapseStorageKey],
  );
  const [contentSearch, setContentSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [otherEditors, setOtherEditors] = useState<{ userId: string; name: string }[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  // Sets from props recomputed once per render - referenced by the
  // ItemRow / banner code to flag broken targets.
  const validCategorySet = new Set(props.validCategorySlugs);
  const validContentSet = new Set(props.validContentIds);

  // Walk the tree once per render to find broken items. Cheap: tree caps
  // at ~30 items in practice (header/footer/mobile each).
  const brokenItems: { label: string; reason: string }[] = [];
  for (const top of tree) {
    const flat = [top, ...(top.children || [])];
    for (const it of flat) {
      if (it.target.type === "CATEGORY" && !validCategorySet.has(it.target.categorySlug)) {
        brokenItems.push({ label: it.label, reason: `category "${it.target.categorySlug}" deleted or inactive` });
      } else if (it.target.type === "CONTENT" && !validContentSet.has(it.target.contentId)) {
        brokenItems.push({ label: it.label, reason: `content row missing or unpublished` });
      }
    }
  }
  const isBroken = (item: Item): boolean => {
    if (item.target.type === "CATEGORY") return !validCategorySet.has(item.target.categorySlug);
    if (item.target.type === "CONTENT") return !validContentSet.has(item.target.contentId);
    return false;
  };

  // Debounced auto-save - 5s after the last edit. The status pill in the
  // header reflects the save state.
  const queueSave = useCallback(() => {
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(), 5000);
  }, []);

  // `force` ignores the dirty guard (the explicit Save Draft button + the
  // pre-publish save always persist the current tree, collapsed or not - the
  // whole `tree` is sent regardless of which rows are collapsed in the editor).
  // `notify` shows a success/error toast (only the manual button does).
  const doSave = async ({ force = false, notify = false }: { force?: boolean; notify?: boolean } = {}) => {
    if (!force && !dirty.current) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/menu-builder/menus/${props.location}/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // sanitizeTree drops any `children` field off nested items so a tree
        // touched by drag/reorder (or loaded from older dirty draft data) passes
        // the strict server schema instead of 400-ing.
        body: JSON.stringify({ items: sanitizeTree(tree) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = formatSaveError(data, res.status);
        setError(msg);
        if (notify) toast.error("Save failed", { description: msg });
      } else {
        dirty.current = false;
        setSavedAt(new Date());
        if (notify) toast.success("Draft saved");
      }
    } catch (e: any) {
      const msg = e.message || "Save failed";
      setError(msg);
      if (notify) toast.error("Save failed", { description: msg });
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    if (kycBlocked) { fireKycToast("publish the menu"); return; }
    // Publishing overwrites the live menu visitors see - confirm first.
    const ok = await confirm({
      title: `Publish the ${props.label.toLowerCase()}?`,
      description:
        "This replaces the current live menu on the website with your latest changes. Visitors will see the new menu within a few seconds. The version it replaces is saved to history and can be restored.",
      confirmText: "Publish",
    });
    if (!ok) return;
    await doSave({ force: true });
    setPublishing(true);
    setError("");
    try {
      const res = await fetch(`/api/menu-builder/menus/${props.location}/publish`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = formatSaveError(data, res.status);
        setError(msg);
        toast.error("Publish failed", { description: msg });
      } else {
        toast.success(`${props.label} published`, {
          description: "Live on the website within a few seconds.",
        });
        router.refresh();
      }
    } catch (e: any) {
      const msg = e.message || "Publish failed";
      setError(msg);
      toast.error("Publish failed", { description: msg });
    }
    setPublishing(false);
  };

  useEffect(() => {
    setMounted(true);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  // Restore the saved collapse layout for THIS location after mount. Done in an
  // effect (not a lazy useState initializer) so the first client render matches
  // the server's all-expanded HTML - then the layout settles to the saved set.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapseStorageKey);
      setCollapsedIds(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch { /* ignore malformed storage */ }
  }, [collapseStorageKey]);

  // Presence heartbeat (Spec #3 F1 #185). Pings every 10s; the API stores
  // entries with a 30s TTL so a closed tab silently times out.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        await fetch(`/api/menu-builder/menus/${props.location}/presence`, { method: "POST" });
        const res = await fetch(`/api/menu-builder/menus/${props.location}/presence`);
        if (res.ok && alive) {
          const data = await res.json();
          setOtherEditors(data.others || []);
        }
      } catch { /* swallow - presence is non-critical */ }
    };
    tick();
    const iv = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(iv); };
  }, [props.location]);

  // --- mutators ---
  // Every Add / Edit / Remove / drag flows through update(), so gating once
  // covers the whole tree editor. Blocked clicks fire a red toast and leave
  // the tree untouched.
  const update = (next: Item[]) => {
    if (kycBlocked) { fireKycToast(); return; }
    setTree(next);
    queueSave();
  };

  const addItem = (target: Target, label: string) => {
    const id = genId();
    update([...tree, { id, label, target, mobileVariant: "show", children: [] }]);
    setSelectedId(id);
  };

  const patchSelected = (patch: Partial<Item>) => {
    if (!selectedId) return;
    update(patchItemById(tree, selectedId, patch));
  };

  const removeById = async (id: string, label: string) => {
    const ok = await confirm({
      title: `Delete "${label}"?`,
      description: "This removes the item (and any sub-items under it) from the menu. Publish to apply it to the live site.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    update(removeItemById(tree, id));
    if (selectedId === id) setSelectedId(null);
  };

  // Add a child under a top-level item (only top items can have children - the
  // 2-level cap). Defaults to a valid internal link so it saves immediately;
  // the editor selects it so the user can set its label/target in the config
  // pane. Expands the parent so the new child is visible.
  const addChild = (parentId: string) => {
    const id = genId();
    const child: Item = { id, label: "New item", target: { type: "INTERNAL_URL", url: "/" }, mobileVariant: "show" };
    update(tree.map((t) => (t.id === parentId ? { ...t, children: [...(t.children ?? []), child] } : t)));
    setSelectedId(id);
    setCollapsedIds((s) => { const n = new Set(s); n.delete(parentId); persistCollapsed(n); return n; });
  };

  const toggleCollapse = (id: string) => {
    setCollapsedIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      persistCollapsed(n);
      return n;
    });
  };

  // --- drag & drop (dnd-kit sortable tree, depth-capped at 2 levels) ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Flatten the tree; while dragging, hide the active item's own descendants so
  // a parent drags as a single block.
  const flattenedItems = useMemo(() => {
    const flat = flattenTree(tree);
    // Hide children of collapsed parents + (while dragging) the active item's
    // own descendants.
    const collapsed = flat
      .filter((i) => collapsedIds.has(i.id) && (i.children?.length ?? 0) > 0)
      .map((i) => i.id);
    const excluded = activeId ? [activeId, ...collapsed] : collapsed;
    return removeChildrenOf(flat, excluded);
  }, [tree, activeId, collapsedIds]);
  const sortedIds = useMemo(() => flattenedItems.map((i) => i.id), [flattenedItems]);
  const activeItem = activeId ? flattenedItems.find((i) => i.id === activeId) ?? null : null;

  // An item that already has children can't be nested (that would create a
  // depth-2 grandchild), so cap its projected depth at 0.
  const activeHasChildren = activeId
    ? !!findItemDeep(tree, String(activeId))?.children?.length
    : false;
  const projected =
    activeId && overId
      ? getProjection(flattenedItems, activeId, overId, offsetLeft, INDENT, activeHasChildren ? 0 : 1)
      : null;

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id);
    setOverId(active.id);
    setSelectedId(String(active.id));
    document.body.style.setProperty("cursor", "grabbing");
  }
  function handleDragMove({ delta }: DragMoveEvent) {
    setOffsetLeft(delta.x);
  }
  function handleDragOver({ over }: DragOverEvent) {
    setOverId(over?.id ?? null);
  }
  function handleDragEnd({ active, over }: DragEndEvent) {
    const proj = projected;
    resetDrag();
    if (!proj || !over) return;
    const clone: FlattenedItem[] = JSON.parse(JSON.stringify(flattenTree(tree)));
    const overIndex = clone.findIndex((i) => i.id === over.id);
    const activeIndex = clone.findIndex((i) => i.id === active.id);
    if (activeIndex < 0 || overIndex < 0) return;
    clone[activeIndex] = { ...clone[activeIndex], depth: proj.depth, parentId: proj.parentId };
    update(buildTree(arrayMove(clone, activeIndex, overIndex)));
  }
  function resetDrag() {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    document.body.style.setProperty("cursor", "");
  }

  // --- selected item lookup ---
  const sel: Item | null = selectedId ? findItemDeep(tree, selectedId) ?? null : null;

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
                ⚠ Header has &gt;10 items - may overflow on narrow screens.
              </span>
            )}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : props.hasUnpublishedDraft ? "Unsaved draft" : props.isPublished ? "Published" : "Unpublished"}
        </span>
        <button
          onClick={() => {
            if (kycBlocked) { fireKycToast("save menu drafts"); return; }
            doSave({ force: true, notify: true });
          }}
          disabled={saving}
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

      {/* Broken-link banner (Spec #3 F1 #185). Lists every item whose
          target row was deleted or unpublished since the last save. */}
      {brokenItems.length > 0 && (
        <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: "10px 14px", borderRadius: 8, fontSize: 13, color: "#92400e", marginBottom: 12 }}>
          <strong>⚠ {brokenItems.length} item{brokenItems.length === 1 ? "" : "s"} reference deleted content:</strong>
          <ul style={{ margin: "6px 0 0 18px" }}>
            {brokenItems.slice(0, 6).map((b, i) => (
              <li key={i}><b>{b.label}</b> - {b.reason}</li>
            ))}
            {brokenItems.length > 6 && <li>…and {brokenItems.length - 6} more</li>}
          </ul>
        </div>
      )}

      {/* Presence banner (Spec #3 F1 #185). Shown when another active
          session was seen on this location in the last 30s. */}
      {otherEditors.length > 0 && (
        <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", padding: "8px 14px", borderRadius: 8, fontSize: 12, color: "#3730a3", marginBottom: 12 }}>
          👥 Also editing now: {otherEditors.map((e) => e.name).join(", ")} - last writer wins.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 320px", gap: 16 }}>
        {/* PALETTE - 4 target type adders. Sticky so it stays in view while the
            tree column scrolls. */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", position: "sticky", top: 16, alignSelf: "start", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
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

          <Section title="Heading / Dropdown">
            <HeadingAdder onAdd={(label) => addItem({ type: "NONE" }, label)} />
          </Section>
        </div>

        {/* TREE - drag to reorder, drag right to nest under the item above */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          {tree.length === 0 ? (
            <p style={{ fontSize: 13, color: "#888", textAlign: "center", padding: 40 }}>
              No items yet. Add one from the palette.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 10 }}>
                Drag the ⠿ handle to reorder · drag right to nest under the item above.
              </p>
              {/* dnd-kit's useSortable generates non-deterministic aria ids
                  (DndDescribedBy-N) that differ between SSR and the client,
                  causing a hydration mismatch. Render static (non-draggable)
                  rows on the server + first client render, then swap to the
                  full DnD tree after mount. */}
              {!mounted ? (
                flattenedItems.map((item) => (
                  <MenuRowContent
                    key={item.id}
                    item={item}
                    depth={item.depth}
                    broken={isBroken(item)}
                    selected={selectedId === item.id}
                    isTop={item.depth === 0}
                    childCount={item.children?.length ?? 0}
                    collapsed={collapsedIds.has(item.id)}
                    onSelect={() => setSelectedId(item.id)}
                    onRemove={() => removeById(item.id, item.label)}
                    onAddChild={() => addChild(item.id)}
                    onToggleCollapse={() => toggleCollapse(item.id)}
                  />
                ))
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDragCancel={resetDrag}
                >
                  <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
                    {flattenedItems.map((item) => (
                      <SortableMenuRow
                        key={item.id}
                        item={item}
                        depth={item.id === activeId && projected ? projected.depth : item.depth}
                        broken={isBroken(item)}
                        selected={selectedId === item.id}
                        isTop={item.depth === 0}
                        childCount={item.children?.length ?? 0}
                        collapsed={collapsedIds.has(item.id)}
                        onSelect={() => setSelectedId(item.id)}
                        onRemove={() => removeById(item.id, item.label)}
                        onAddChild={() => addChild(item.id)}
                        onToggleCollapse={() => toggleCollapse(item.id)}
                      />
                    ))}
                  </SortableContext>
                  {createPortal(
                    <DragOverlay>
                      {activeItem ? (
                        <MenuRowContent
                          item={activeItem}
                          depth={0}
                          broken={isBroken(activeItem)}
                          selected
                          clone
                          childCount={getChildCount(tree, String(activeId))}
                        />
                      ) : null}
                    </DragOverlay>,
                    document.body,
                  )}
                </DndContext>
              )}
            </>
          )}
        </div>

        {/* CONFIG PANEL - sticky so it stays in view while the tree scrolls. */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", position: "sticky", top: 16, alignSelf: "start", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
          {!sel ? (
            <p style={{ fontSize: 13, color: "#888" }}>Select an item to edit.</p>
          ) : (
            <ItemConfig
              item={sel}
              categories={props.categories}
              recentContent={props.recentContent}
              onChange={(patch) => patchSelected(patch)}
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

// Searchable category combobox (shadcn Popover + Input + filtered list - no
// native <select>). Controlled by `value` (slug; "" = none).
function CategoryCombobox({
  categories, value, onChange, placeholder = "Pick a category",
}: {
  categories: Category[];
  value: string;
  onChange: (slug: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = categories.find((c) => c.slug === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? categories.filter((c) =>
        c.nameEn.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q))
    : categories;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between h-9 font-normal">
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.nameEn : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0" style={{ width: "var(--radix-popover-trigger-width)" }}>
        <div className="border-b p-2">
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories…" className="h-8" />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No category found.</p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => { onChange(c.slug); setOpen(false); setQuery(""); }}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                  c.slug === value && "bg-accent",
                )}
              >
                <span className="truncate">{c.nameEn}</span>
                {c.slug === value && <Check className="ml-2 h-4 w-4 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Palette adder: search a category and add it on click.
function CategoryPicker({ categories, onPick }: { categories: Category[]; onPick: (c: Category) => void }) {
  return (
    <CategoryCombobox
      categories={categories}
      value=""
      placeholder="Search & add category"
      onChange={(slug) => { const c = categories.find((x) => x.slug === slug); if (c) onPick(c); }}
    />
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

// Adds a label-only item (NONE target). Used for the header dropdown trigger
// ("మరిన్ని") and footer column headings - it has no link, just children.
function HeadingAdder({ onAdd }: { onAdd: (label: string) => void }) {
  const [label, setLabel] = useState("");
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Heading label" style={inp} />
      <button onClick={() => { if (label) { onAdd(label); setLabel(""); } }}
        disabled={!label} style={addBtn}>+</button>
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

// A single draggable row. Wraps useSortable; the ⠿ handle carries the drag
// listeners so clicking the rest of the row just selects it.
function SortableMenuRow({
  item, depth, broken, selected, isTop, childCount, collapsed,
  onSelect, onRemove, onAddChild, onToggleCollapse,
}: {
  item: Item; depth: number; broken?: boolean; selected: boolean;
  isTop?: boolean; childCount?: number; collapsed?: boolean;
  onSelect: () => void; onRemove: () => void;
  onAddChild?: () => void; onToggleCollapse?: () => void;
}) {
  const { setNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  // While this row is the one being dragged, render it as a dashed drop
  // indicator at the PROJECTED depth (the live menu-tree-dnd projection), so the
  // user sees exactly where it will land - indented when it will become a sub
  // item. The solid row itself floats in the DragOverlay. Mirrors the dnd-kit
  // "indicator" ghost (.Wrapper.ghost.indicator).
  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style}>
        <div
          style={{
            marginLeft: depth * INDENT,
            height: 38,
            marginBottom: 4,
            borderRadius: 6,
            border: "1px dashed #93c5fd",
            background: "#eff6ff",
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingLeft: 12,
            color: "#3b82f6",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {item.label}
          {depth > 0 && (
            <span style={{ fontStyle: "italic", fontWeight: 400, fontSize: 12, color: "#6b7280" }}>
              sub item
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div ref={setNodeRef} style={style}>
      <MenuRowContent
        item={item}
        depth={depth}
        broken={broken}
        selected={selected}
        isTop={isTop}
        childCount={childCount}
        collapsed={collapsed}
        onSelect={onSelect}
        onRemove={onRemove}
        onAddChild={onAddChild}
        onToggleCollapse={onToggleCollapse}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// Row visuals - shared by the live list and the DragOverlay clone.
function MenuRowContent({
  item, depth, broken, selected, clone, childCount, isTop, collapsed,
  handleProps, onSelect, onRemove, onAddChild, onToggleCollapse,
}: {
  item: Item; depth: number; broken?: boolean; selected: boolean;
  clone?: boolean; childCount?: number; isTop?: boolean; collapsed?: boolean;
  handleProps?: any;
  onSelect?: () => void; onRemove?: () => void;
  onAddChild?: () => void; onToggleCollapse?: () => void;
}) {
  const hasChildren = (childCount ?? 0) > 0;
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 10px", borderRadius: 6, marginBottom: 4,
        marginLeft: depth * INDENT,
        background: selected ? "#eff6ff" : broken ? "#fef3c7" : "#fff",
        border: selected ? "1px solid #93c5fd" : broken ? "1px solid #fde68a" : "1px solid #f1f1f4",
        boxShadow: clone ? "0 8px 20px rgba(0,0,0,0.18)" : undefined,
        cursor: "pointer",
        // The DragOverlay already sizes itself to the dragged row's real width,
        // so the clone must NOT impose its own width (that made it look short).
        boxSizing: "border-box",
      }}
    >
      <span
        {...(handleProps || {})}
        title="Drag to move"
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: "grab", color: "#9ca3af", fontSize: 15, padding: "0 2px", touchAction: "none", lineHeight: 1 }}
      >
        ⠿
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", width: 60 }}>
        {item.target.type === "NONE" ? "HEADING" : item.target.type.replace("_URL", "").slice(0, 8)}
      </span>
      {broken && <span title="Target row no longer exists" style={{ fontSize: 13 }}>⚠</span>}
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </span>
      {!clone && collapsed && hasChildren && (
        <span style={{ fontSize: 11, color: "#9ca3af" }}>({childCount})</span>
      )}
      {item.mobileVariant === "hide" && <span title="Hidden on mobile" style={{ fontSize: 10, color: "#6b7280" }}>📱⊘</span>}
      {clone && childCount ? <span style={{ fontSize: 11, color: "#6b7280", marginRight: 4 }}>+{childCount}</span> : null}
      {/* Collapse/expand chevron (leftmost of the action group). Editor-only. */}
      {!clone && hasChildren && (
        <WithTooltip text={collapsed ? "Expand" : "Collapse"}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-500"
            onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(); }}
          >
            <ChevronDown className={`transition-transform ${collapsed ? "-rotate-90" : ""}`} />
          </Button>
        </WithTooltip>
      )}
      {!clone && isTop && onAddChild && (
        <WithTooltip text="Add sub-item">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-blue-600 hover:text-blue-700"
            onClick={(e) => { e.stopPropagation(); onAddChild(); }}
          >
            <Plus />
          </Button>
        </WithTooltip>
      )}
      {onRemove && (
        <WithTooltip text="Delete">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <Trash />
          </Button>
        </WithTooltip>
      )}
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
        {(["NONE", "CATEGORY", "INTERNAL_URL", "EXTERNAL_URL", "CONTENT"] as const).map((t) => (
          <label key={t} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="radio" checked={item.target.type === t} onChange={() => {
              // Switching type resets the type-specific fields.
              if (t === "NONE") onChange({ target: { type: "NONE" } });
              else if (t === "CATEGORY") onChange({ target: { type: "CATEGORY", categorySlug: "" } });
              else if (t === "INTERNAL_URL") onChange({ target: { type: "INTERNAL_URL", url: "/" } });
              else if (t === "EXTERNAL_URL") onChange({ target: { type: "EXTERNAL_URL", url: "https://" } });
              else onChange({ target: { type: "CONTENT", contentId: "" } });
            }} />
            {t === "NONE" ? "Heading (no link)" : t.replace("_", " ")}
          </label>
        ))}
      </div>

      {item.target.type === "CATEGORY" && (
        <>
          <Label>Category</Label>
          <CategoryCombobox
            categories={categories}
            value={item.target.categorySlug}
            onChange={(slug) => onChange({ target: { type: "CATEGORY", categorySlug: slug } })}
          />
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
            <option value="">- pick -</option>
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
