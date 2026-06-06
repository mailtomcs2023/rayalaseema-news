// Tree algorithms for the drag-and-drop Menu Builder. Ported from
// K-H-Rayhan/react-dnd-menu-builder (src/Builder/utilities.ts), which itself is
// dnd-kit's "sortable tree" example, but typed to OUR menu Item shape (a
// discriminated `target` instead of a plain href) and CAPPED AT 2 LEVELS:
// getProjection never returns a depth > 1, and an item that has children can't
// be nested at all (that would create depth-2 grandchildren, which our schema +
// the public renderers don't support).
import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

export type Target =
  | { type: "NONE" }
  | { type: "CATEGORY"; categorySlug: string }
  | { type: "DISTRICT"; districtSlug: string }
  | { type: "INTERNAL_URL"; url: string }
  | { type: "EXTERNAL_URL"; url: string }
  | { type: "CONTENT"; contentId: string; contentTypeCache?: string; contentSlugCache?: string };

// Secondary header config carried on a top-level item. The sub-nav links are
// the item's nested `children`; this just holds the on/off + sticky flags.
export interface SecondaryHeaderConfig {
  enabled: boolean;
  sticky?: boolean;
  items: Item[];
}

export interface Item {
  id: string;
  label: string;
  target: Target;
  mobileVariant: "show" | "hide";
  openInNewTab?: boolean;
  children?: Item[];
  secondaryHeader?: SecondaryHeaderConfig;
}

export interface FlattenedItem extends Item {
  parentId: string | null;
  depth: number;
  index: number;
}

// Max nesting depth (0 = top level, 1 = child). Our schema is exactly 2 levels.
export const MAX_DEPTH = 1;

// --- flatten / build ---------------------------------------------------------
function flatten(items: Item[], parentId: string | null = null, depth = 0): FlattenedItem[] {
  return items.reduce<FlattenedItem[]>((acc, item, index) => {
    return [
      ...acc,
      { ...item, parentId, depth, index },
      ...flatten(item.children ?? [], item.id, depth + 1),
    ];
  }, []);
}

export function flattenTree(items: Item[]): FlattenedItem[] {
  return flatten(items);
}

// Rebuild the nested Item[] from the (re-ordered) flat list. Strips the
// flatten-only fields (parentId/depth/index) so the result is clean Items.
export function buildTree(flattened: FlattenedItem[]): Item[] {
  const root: { id: string; children: Item[] } = { id: "root", children: [] };
  const nodes: Record<string, { children: Item[] } & Partial<Item>> = { root };

  for (const f of flattened) {
    const { parentId: _p, depth: _d, index: _i, children: _c, ...fields } = f;
    nodes[f.id] = { ...(fields as Item), children: [] };
  }
  for (const f of flattened) {
    const parentId = f.parentId ?? "root";
    const parent = nodes[parentId] ?? root;
    parent.children.push(nodes[f.id] as Item);
  }
  // Strip the `children` field off nested items - see sanitizeTree.
  return sanitizeTree(root.children);
}

// Depth is capped at 2 levels, so ONLY top-level items may carry a `children`
// array. The strict server schema (childItemSchema) FORBIDS a `children` key on
// nested items, so an empty `children: []` left on a child (as buildTree's node
// map produces) makes the draft/publish save 400. This strips it off children
// (and drops any stray grandchildren) so the tree always validates. Idempotent,
// so it's safe to also run at the save boundary over already-loaded data.
export function sanitizeTree(items: Item[]): Item[] {
  return items.map((top) => {
    const kids = (top.children ?? []).map((child) => {
      const { children: _drop, ...rest } = child;
      return rest as Item;
    });
    const out: Item = { ...top, children: kids };
    if (top.secondaryHeader) {
      out.secondaryHeader = {
        enabled: !!top.secondaryHeader.enabled,
        sticky: !!top.secondaryHeader.sticky,
        items: (top.secondaryHeader.items ?? []).map((it) => {
          const { children: _d, ...rest } = it;
          return rest as Item;
        }),
      };
    }
    return out;
  });
}

// --- projection (where the dragged row would land) ---------------------------
function getDragDepth(offset: number, indentationWidth: number) {
  return Math.round(offset / indentationWidth);
}

function getMaxDepth(previousItem: FlattenedItem | undefined) {
  return previousItem ? previousItem.depth + 1 : 0;
}

function getMinDepth(nextItem: FlattenedItem | undefined) {
  return nextItem ? nextItem.depth : 0;
}

export function getProjection(
  items: FlattenedItem[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragOffset: number,
  indentationWidth: number,
  // 0 when the dragged item has children (can't be nested); 1 otherwise.
  depthCap: number = MAX_DEPTH,
) {
  const overItemIndex = items.findIndex(({ id }) => id === overId);
  const activeItemIndex = items.findIndex(({ id }) => id === activeId);
  const activeItem = items[activeItemIndex];
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];
  const dragDepth = getDragDepth(dragOffset, indentationWidth);
  const projectedDepth = activeItem.depth + dragDepth;
  // Clamp to our 2-level rule: never deeper than MAX_DEPTH, and no deeper than
  // the caller allows for this active item (depthCap).
  const maxDepth = Math.min(getMaxDepth(previousItem), MAX_DEPTH, depthCap);
  const minDepth = getMinDepth(nextItem);
  let depth = projectedDepth;

  if (projectedDepth >= maxDepth) depth = maxDepth;
  else if (projectedDepth < minDepth) depth = minDepth;

  return { depth, maxDepth, minDepth, parentId: getParentId() };

  function getParentId(): string | null {
    if (depth === 0 || !previousItem) return null;
    if (depth === previousItem.depth) return previousItem.parentId;
    if (depth > previousItem.depth) return previousItem.id;
    const newParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.parentId;
    return newParent ?? null;
  }
}

// --- helpers -----------------------------------------------------------------
// While dragging, hide the active item's own descendants + collapsed subtrees.
export function removeChildrenOf(items: FlattenedItem[], ids: UniqueIdentifier[]) {
  const exclude = [...ids];
  return items.filter((item) => {
    if (item.parentId && exclude.includes(item.parentId)) {
      if ((item.children?.length ?? 0)) exclude.push(item.id);
      return false;
    }
    return true;
  });
}

export function findItemDeep(items: Item[], itemId: string): Item | undefined {
  for (const item of items) {
    if (item.id === itemId) return item;
    const kids = item.children;
    if (kids?.length) {
      const found = findItemDeep(kids, itemId);
      if (found) return found;
    }
  }
  return undefined;
}

function countChildren(items: Item[], count = 0): number {
  return items.reduce((acc, { children }) => {
    if (children?.length) return countChildren(children, acc + 1);
    return acc + 1;
  }, count);
}

export function getChildCount(items: Item[], id: string | null) {
  if (!id) return 0;
  const item = findItemDeep(items, id);
  return item ? countChildren(item.children ?? []) : 0;
}

export function removeItemById(items: Item[], id: string): Item[] {
  const next: Item[] = [];
  for (const item of items) {
    if (item.id === id) continue;
    if (item.children?.length) item.children = removeItemById(item.children, id);
    next.push(item);
  }
  return next;
}

// Patch a single item (by id) anywhere in the tree.
export function patchItemById(items: Item[], id: string, patch: Partial<Item>): Item[] {
  return items.map((item) => {
    if (item.id === id) return { ...item, ...patch };
    if (item.children?.length) return { ...item, children: patchItemById(item.children, id, patch) };
    return item;
  });
}
