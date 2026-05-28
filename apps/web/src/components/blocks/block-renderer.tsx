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

export async function BlockRenderer({
  block,
  ctx,
  composites,
  visited,
}: {
  block: Block;
  ctx: PageContext;
  composites?: CompositeMap;
  visited?: ReadonlySet<string>;
}): Promise<React.ReactElement | null> {
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
          />
        ))}
      </div>
    );
  }

  if (!isBuiltinBlockType(block.type)) return null;

  const entry = REGISTRY[block.type];
  const data = await entry.fetcher(block.config as Record<string, unknown>, ctx);

  if (entry.hideWhenEmpty ? entry.hideWhenEmpty(data) : data === null) {
    return null;
  }

  const Component = entry.component;
  const cls = variantClass(block.mobileVariant);
  const rendered = <Component {...(data || {})} />;

  return (
    <div data-block-id={block.id} data-block-type={block.type} className={cls}>
      {rendered}
    </div>
  );
}
