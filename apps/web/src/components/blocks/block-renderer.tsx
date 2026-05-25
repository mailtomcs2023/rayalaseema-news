// Page Builder (Spec #2) — render a single block from a layout tree.
//
// `mobileVariant`:
//   "show"         → render normally (default)
//   "hide"         → wrapped in <div class="pb-mobile-hide"> so CSS hides it < 768px
//   "stack-below"  → ordering hint for the editor; renders normally on web
//   "compact"      → adds .pb-mobile-compact for the component's own CSS to honour
//
// Composite blocks (F2 #169) defer to a placeholder until that issue lands.

import type { Block } from "@rayalaseema/db";
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

export async function BlockRenderer({
  block,
  ctx,
}: {
  block: Block;
  ctx: PageContext;
}) {
  if (block.type === "Composite") {
    // Composite expansion lands in F2 (#169). Skip silently for now so a
    // layout that already references a composite doesn't crash on render.
    return null;
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
