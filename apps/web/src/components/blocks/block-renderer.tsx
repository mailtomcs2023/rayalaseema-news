// Page Builder (Spec #2) - render a single block from a layout tree.
//
// `mobileVariant`:
//   "show"         → render normally (default)
//   "hide"         → wrapped in <div class="pb-mobile-hide"> so CSS hides it < 768px
//   "stack-below"  → ordering hint for the editor; renders normally on web
//   "compact"      → adds .pb-mobile-compact for the component's own CSS to honour
//
// Composite blocks (F2 #169): expand inline using a pre-fetched composite
// map. A `visited` Set tracks the recursion stack so a Composite that
// references itself (directly or indirectly) renders an error block
// instead of stack-overflowing.

import { blockSchema, type Block } from "@rayalaseema/db";
import { REGISTRY, isBuiltinBlockType } from "./registry";
import type { PageContext } from "./types";

function variantClass(v: Block["mobileVariant"]): string {
  switch (v) {
    case "hide":
      return "pb-mobile-hide";
    case "stack-below":
      return "pb-mobile-stack";
    case "compact":
      return "pb-mobile-compact";
    case "show":
    default:
      return "";
  }
}

export interface CompositeRef {
  id: string;
  slug: string;
  name: string;
  blocks: unknown; // validated by Zod at expand time
}

export type CompositeMap = Map<string, CompositeRef>;

function CompositeError({ id, message }: { id: string; message: string }) {
  return (
    <div
      data-block-id={id}
      data-block-type="Composite"
      style={{
        background: "#FEF2F2",
        border: "1px dashed #FCA5A5",
        color: "#991B1B",
        borderRadius: 6,
        padding: "10px 12px",
        margin: "8px 0",
        fontSize: 13,
      }}
    >
      Composite block error: {message}
    </div>
  );
}

// Editor-only stand-in for a block that renders nothing (no ad configured,
// no articles match, unknown type). On the live site these blocks are simply
// omitted; in the page-builder preview that's indistinguishable from a broken
// editor, so we draw a labelled, selectable box (keeps data-block-id so the
// outline ↔ canvas selection bridge still works).
function PreviewPlaceholder({
  id,
  type,
  cls,
  note,
}: {
  id: string;
  type: string;
  cls: string;
  note?: string;
}) {
  return (
    <div
      data-block-id={id}
      data-block-type={type}
      className={cls}
      style={{
        border: "1px dashed #cbd5e1",
        background: "#f8fafc",
        color: "#64748b",
        borderRadius: 6,
        padding: "14px 16px",
        margin: "6px 0",
        fontSize: 13,
        textAlign: "center",
      }}
    >
      <strong style={{ color: "#475569" }}>{type}</strong>
      <div style={{ fontSize: 11, marginTop: 3, lineHeight: 1.5 }}>
        {note ||
          "Empty in the editor - this block fills with live data (ads / articles) on the published site."}
      </div>
    </div>
  );
}

export async function BlockRenderer({
  block,
  ctx,
  composites,
  visited,
  preview = false,
}: {
  block: Block;
  ctx: PageContext;
  composites?: CompositeMap;
  visited?: ReadonlySet<string>;
  // True only inside the page-builder editor preview (draft render). When set,
  // blocks that would render nothing show a placeholder instead of vanishing.
  preview?: boolean;
}): Promise<React.ReactElement | null> {
  if (block.type === "Columns") {
    // Container block: lay out N columns side by side, each recursing into its
    // own ordered list of (leaf) blocks. Stacks vertically on mobile via CSS.
    const cfg = block.config as {
      columns: { id: string; blocks: Block[] }[];
      gap?: number;
      stackMobile?: boolean;
    };
    const cls = variantClass(block.mobileVariant);
    const stackCls = cfg.stackMobile === false ? "" : " pb-columns-stack";
    return (
      <div
        data-block-id={block.id}
        data-block-type="Columns"
        className={`pb-columns${stackCls}${cls ? " " + cls : ""}`}
        style={{ display: "flex", gap: cfg.gap ?? 24, alignItems: "flex-start" }}
      >
        {(cfg.columns || []).map((col) => (
          <div key={col.id} data-column-id={col.id} className="pb-column" style={{ flex: "1 1 0", minWidth: 0 }}>
            {(col.blocks || []).map((inner) => (
              <BlockRenderer
                key={inner.id}
                block={inner as Block}
                ctx={ctx}
                composites={composites}
                visited={visited}
                preview={preview}
              />
            ))}
            {preview && (!col.blocks || col.blocks.length === 0) && (
              <PreviewPlaceholder id={col.id} type="Column" cls="" note="Empty column — add blocks in the editor." />
            )}
          </div>
        ))}
      </div>
    );
  }

  if (block.type === "Composite") {
    const compositeId = block.compositeId;
    if (!compositeId) return <CompositeError id={block.id} message="no compositeId set" />;

    if (visited?.has(compositeId)) {
      return (
        <CompositeError
          id={block.id}
          message={`cycle detected (composite ${compositeId} references itself)`}
        />
      );
    }

    const ref = composites?.get(compositeId);
    if (!ref) {
      return (
        <CompositeError
          id={block.id}
          message={`composite ${compositeId} not found (deleted?)`}
        />
      );
    }

    // Validate the stored blocks JSON shape.
    const arr = Array.isArray(ref.blocks) ? ref.blocks : [];
    const innerBlocks: Block[] = [];
    for (const raw of arr) {
      const parsed = blockSchema.safeParse(raw);
      if (parsed.success) innerBlocks.push(parsed.data);
    }

    const nextVisited = new Set(visited ?? []);
    nextVisited.add(compositeId);

    const cls = variantClass(block.mobileVariant);

    return (
      <div
        data-block-id={block.id}
        data-block-type="Composite"
        data-composite-id={compositeId}
        className={cls}
      >
        {innerBlocks.map((inner) => (
          <BlockRenderer
            key={inner.id}
            block={inner}
            ctx={ctx}
            composites={composites}
            visited={nextVisited}
            preview={preview}
          />
        ))}
      </div>
    );
  }

  const cls = variantClass(block.mobileVariant);

  if (!isBuiltinBlockType(block.type)) {
    return preview
      ? <PreviewPlaceholder id={block.id} type={block.type} cls={cls} note="Unknown block type - nothing to render." />
      : null;
  }

  const entry = REGISTRY[block.type];
  const data = await entry.fetcher(block.config as Record<string, unknown>, ctx);

  const emptyLive = entry.hideWhenEmpty ? entry.hideWhenEmpty(data) : data === null;
  // Ad blocks don't return null when their DB-ad list is empty - they fall
  // back to an AdSense unit, which renders nothing inside the editor iframe.
  // Treat empty ads as "empty" FOR THE PREVIEW PLACEHOLDER ONLY; the live
  // render path is untouched (AdSense fallback still runs when !preview).
  const emptyAds =
    !!data &&
    Array.isArray((data as { ads?: unknown[] }).ads) &&
    (data as { ads: unknown[] }).ads.length === 0;

  // Live site: omit empty blocks exactly as before.
  if (emptyLive && !preview) return null;
  // Editor preview: show a labelled placeholder so the operator can see and
  // select the block even when it has no content/ad in this context.
  if (preview && (emptyLive || emptyAds)) {
    return <PreviewPlaceholder id={block.id} type={block.type} cls={cls} />;
  }

  const Component = entry.component;
  const rendered = <Component {...(data || {})} />;

  return (
    <div data-block-id={block.id} data-block-type={block.type} className={cls}>
      {rendered}
    </div>
  );
}
