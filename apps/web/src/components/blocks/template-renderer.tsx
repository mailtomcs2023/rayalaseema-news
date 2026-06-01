// Page Builder (Spec #2) - top-level renderer for a URL path.
//
// Looks up the winning Template via the assignment table (priority DESC +
// pattern-length DESC tie-break), validates the stored layout JSON with the
// shared Zod schema, and renders each block via BlockRenderer.
//
// `?draft=1` query - when present, the iframe preview route (E1) uses the
// template's draftLayout instead of the published layout. The public entry
// points never set this.

import { prisma, layoutSchema, resolveAssignment } from "@rayalaseema/db";
import type { PageContext } from "./types";
import { BlockRenderer, type CompositeMap } from "./block-renderer";

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
    districtSlug: ctx?.districtSlug ?? null,
  };

  // Only pay the composite query when the layout actually references one.
  const needsComposites = parsed.data.blocks.some((b) => b.type === "Composite");
  const composites = needsComposites ? await fetchComposites() : undefined;

  // Resolve every block on the server with per-block error isolation. One
  // crashing fetcher would otherwise 500 the whole page (RSC promises
  // rejecting at the parent boundary). Catching per block keeps the
  // homepage rendering even if a single SectionBand / CinemaBand fails.
  const resolved = await Promise.all(
    parsed.data.blocks.map(async (block) => {
      try {
        const el = await BlockRenderer({ block, ctx: pageCtx, composites });
        return el;
      } catch (err) {
        console.error(`[TemplateRenderer] block ${block.id} (${block.type}) crashed:`, err);
        return null;
      }
    }),
  );

  return (
    <>
      {resolved.map((el, i) => (
        <div key={parsed.data.blocks[i].id}>{el}</div>
      ))}
      <style>{`
        @media (max-width: 768px) {
          .pb-mobile-hide { display: none !important; }
        }
      `}</style>
    </>
  );
}
