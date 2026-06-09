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

import Link from "next/link";
import { blockSchema, type Block } from "@rayalaseema/db";
import { REGISTRY, isBuiltinBlockType } from "./registry";
import { fetchLoopItems } from "./fetchers";
import type { PageContext, LoopItem } from "./types";

// Resolve a primitive's bound field from the current loop item to a string
// (for Heading/Text) or an image URL (for Image).
function resolveBinding(item: LoopItem | null | undefined, binding: string): string {
  if (!item) return "";
  switch (binding) {
    case "title": return item.title;
    case "summary": return item.summary ?? "";
    case "image": return item.featuredImage ?? "";
    case "category": return item.categoryName ?? "";
    case "link": return item.href;
    case "date":
      return item.publishedAtIso
        ? new Date(item.publishedAtIso).toLocaleDateString("te-IN", { day: "numeric", month: "short", year: "numeric" })
        : "";
    default: return "";
  }
}

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
  loopItem,
}: {
  block: Block;
  ctx: PageContext;
  composites?: CompositeMap;
  visited?: ReadonlySet<string>;
  // True only inside the page-builder editor preview (draft render). When set,
  // blocks that would render nothing show a placeholder instead of vanishing.
  preview?: boolean;
  // The current item when rendering inside a Loop - primitives bind to it.
  loopItem?: LoopItem | null;
}): Promise<React.ReactElement | null> {
  // --- Loop: fetch the data source + repeat the inner primitives per item ---
  if (block.type === "Loop") {
    const cfg = block.config as { count: number; categorySlug?: string; columns?: number; gap?: number };
    const items = await fetchLoopItems(cfg as never);
    const inner = ((block as { blocks?: Block[] }).blocks || []) as Block[];
    const cls = variantClass(block.mobileVariant);
    if (items.length === 0 || inner.length === 0) {
      return preview
        ? <PreviewPlaceholder id={block.id} type="Loop" cls={cls} note={inner.length === 0 ? "Empty loop — add Heading/Image/Text inside it." : "No items match this loop's source."} />
        : null;
    }
    return (
      <div
        data-block-id={block.id}
        data-block-type="Loop"
        className={`pb-columns-stack ${cls}`.trim()}
        style={{ display: "grid", gridTemplateColumns: `repeat(${cfg.columns ?? 1}, minmax(0, 1fr))`, gap: cfg.gap ?? 16 }}
      >
        {items.map((item) => (
          <div key={item.id} data-loop-item={item.id} className="pb-column">
            {inner.map((child) => (
              <BlockRenderer key={`${item.id}:${child.id}`} block={child} ctx={ctx} composites={composites} visited={visited} preview={preview} loopItem={item} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // --- Dynamic primitives (bind to the current loop item, or render static) ---
  if (block.type === "Heading") {
    const cfg = block.config as { binding: string; staticText?: string; level?: "h2" | "h3" | "h4"; linkToItem?: boolean };
    const text = cfg.binding === "static" ? (cfg.staticText ?? "") : resolveBinding(loopItem, cfg.binding);
    if (!text) return preview ? <PreviewPlaceholder id={block.id} type="Heading" cls="" note={`bound to ${cfg.binding}`} /> : null;
    const Tag = (cfg.level ?? "h3") as "h2" | "h3" | "h4";
    const inner = <Tag style={{ margin: 0, fontFamily: "var(--font-telugu-heading), serif", fontWeight: 700, lineHeight: 1.35, color: "#111827" }}>{text}</Tag>;
    return (
      <div data-block-id={block.id} data-block-type="Heading">
        {cfg.linkToItem && loopItem?.href ? <Link href={loopItem.href} style={{ textDecoration: "none", color: "inherit" }}>{inner}</Link> : inner}
      </div>
    );
  }
  if (block.type === "Text") {
    const cfg = block.config as { binding: string; staticText?: string };
    const text = cfg.binding === "static" ? (cfg.staticText ?? "") : resolveBinding(loopItem, cfg.binding);
    if (!text) return preview ? <PreviewPlaceholder id={block.id} type="Text" cls="" note={`bound to ${cfg.binding}`} /> : null;
    return (
      <div data-block-id={block.id} data-block-type="Text">
        <p style={{ margin: "4px 0", fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 13, lineHeight: 1.6, color: "#4b5563" }}>{text}</p>
      </div>
    );
  }
  if (block.type === "Image") {
    const cfg = block.config as { binding: string; staticUrl?: string; linkToItem?: boolean };
    const src = cfg.binding === "static" ? (cfg.staticUrl ?? "") : resolveBinding(loopItem, cfg.binding);
    if (!src) return preview ? <PreviewPlaceholder id={block.id} type="Image" cls="" note={`bound to ${cfg.binding}`} /> : null;
    const img = <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "auto", display: "block", borderRadius: 8, aspectRatio: "16 / 10", objectFit: "cover" }} />;
    return (
      <div data-block-id={block.id} data-block-type="Image">
        {cfg.linkToItem && loopItem?.href ? <Link href={loopItem.href}>{img}</Link> : img}
      </div>
    );
  }

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
