// Page Builder (Spec #2) - top-level renderer for a URL path.
//
// Looks up the winning Template via the assignment table (priority DESC +
// pattern-length DESC tie-break), validates the stored layout JSON with the
// shared Zod schema, and renders each block via BlockRenderer.
//
// `?draft=1` query - when present, the iframe preview route (E1) uses the
// template's draftLayout instead of the published layout. The public entry
// points never set this.

import { Suspense } from "react";
import { prisma, layoutSchema, resolveAssignment } from "@rayalaseema/db";
import type { PageContext } from "./types";
import { BlockRenderer, type CompositeMap } from "./block-renderer";
import type { Block } from "@rayalaseema/db";

// Cheap composite map: one query that grabs everything referenced (or
// likely to be referenced) by the rendered template. We pull all
// composites unconditionally - the row count is small (curated by
// editors, not bulk-imported), so a single query beats N round-trips
// for individual Composite blocks.
async function fetchComposites(): Promise<CompositeMap> {
  const rows = await prisma.compositeBlock.findMany({
    select: { id: true, slug: true, name: true, blocks: true },
  });
  const map: CompositeMap = new Map();
  for (const r of rows) map.set(r.id, r);
  return map;
}

function deriveCategorySlug(urlPath: string): string | undefined {
  const m = urlPath.match(/^\/category\/([^/]+)\/?$/);
  return m ? m[1] : undefined;
}

async function resolveTemplate(urlPath: string) {
  const rows = await prisma.templateAssignment.findMany({
    where: { active: true, template: { isPublished: true } },
    include: { template: true },
  });
  const winner = resolveAssignment(
    rows.map((r) => ({
      pattern: r.pattern,
      priority: r.priority,
      active: r.active,
      template: { isPublished: r.template.isPublished },
      _row: r,
    })),
    urlPath,
  );
  return (winner as { _row: typeof rows[number] } | null)?._row.template ?? null;
}

export function EmptyTemplate({ urlPath }: { urlPath: string }) {
  return (
    <div
      style={{
        padding: "80px 16px",
        textAlign: "center",
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 8,
        margin: "24px auto",
        maxWidth: 720,
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111", marginBottom: 8 }}>
        Layout coming soon…
      </h2>
      <p style={{ fontSize: 13, color: "#666" }}>
        No template assigned to <code>{urlPath}</code>.
      </p>
    </div>
  );
}

interface TemplateRendererProps {
  urlPath: string;
  ctx?: Partial<Omit<PageContext, "urlPath">>;
  // Optional override - when supplied the renderer skips assignment lookup
  // and renders this template directly. Used by the editor preview route.
  templateOverride?: { layout: unknown; draftLayout?: unknown } | null;
  draft?: boolean;
}

export async function TemplateRenderer({
  urlPath,
  ctx,
  templateOverride,
  draft = false,
}: TemplateRendererProps) {
  const tpl = templateOverride ?? (await resolveTemplate(urlPath));
  if (!tpl) return <EmptyTemplate urlPath={urlPath} />;

  const rawLayout = draft && tpl.draftLayout ? tpl.draftLayout : tpl.layout;
  const parsed = layoutSchema.safeParse(rawLayout);
  if (!parsed.success) {
    return <EmptyTemplate urlPath={urlPath} />;
  }

  const pageCtx: PageContext = {
    urlPath,
    categorySlug: ctx?.categorySlug ?? deriveCategorySlug(urlPath),
  };

  // Only pay the composite query when the layout actually references one.
  const needsComposites = parsed.data.blocks.some((b) => b.type === "Composite");
  const composites = needsComposites ? await fetchComposites() : undefined;

  // Stream blocks via <Suspense> instead of awaiting them all in a
  // Promise.all then flushing in one go. Each block becomes an async
  // RSC the runtime can flush independently: AboveFold (the LCP) ships
  // out the door as soon as its fetcher resolves, while heavier blocks
  // (SectionBand / CinemaBand fetching dozens of articles) finish in
  // the background and arrive on the wire later. PSI's "Maximum
  // critical path latency" was bound by the slowest single block;
  // streaming unbinds it.
  return (
    <>
      {parsed.data.blocks.map((block) => (
        <Suspense key={block.id} fallback={null}>
          <SafeBlock block={block} ctx={pageCtx} composites={composites} preview={draft} />
        </Suspense>
      ))}
      <style>{`
        @media (max-width: 768px) {
          .pb-mobile-hide { display: none !important; }
        }
      `}</style>
    </>
  );
}

// Per-block error boundary: a crashing fetcher inside the Suspense
// must not bubble up and break the whole page render. Mirrors the
// previous try/catch in the awaited loop.
async function SafeBlock({
  block,
  ctx,
  composites,
  preview,
}: {
  block: Block;
  ctx: PageContext;
  composites?: CompositeMap;
  preview: boolean;
}) {
  try {
    const el = await BlockRenderer({ block, ctx, composites, preview });
    return <div>{el}</div>;
  } catch (err) {
    console.error(`[TemplateRenderer] block ${block.id} (${block.type}) crashed:`, err);
    return null;
  }
}
