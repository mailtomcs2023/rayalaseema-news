// Shared skeleton variants for the admin loading.tsx fallbacks. The
// existing <TableSkeleton> covers every list page; this file adds the
// shapes the dashboard / card-grid / form pages need so each route gets
// chrome that matches what's about to render.
//
// All variants leave a 240px gutter so the sidebar (rendered separately
// by each page) doesn't have to mount before the skeleton appears.

import { Skeleton } from "@/components/ui/skeleton";

/** Header block: title + subtitle. Used at the top of every variant. */
function PageHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  if (!title && !subtitle) return null;
  return (
    <div className="mb-6 space-y-2">
      {title ? (
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", margin: 0 }}>{title}</h1>
      ) : (
        <Skeleton className="h-7 w-48" />
      )}
      {subtitle ? (
        <p style={{ fontSize: 13, color: "#888", margin: 0 }}>{subtitle}</p>
      ) : (
        <Skeleton className="h-4 w-72" />
      )}
    </div>
  );
}

/**
 * Dashboard skeleton - 10-card KPI grid, 4-tile quick-actions, recent-
 * articles table preview. Matches the structure of app/(dashboard)/page.tsx
 * so the swap-in feels instant.
 */
export function DashboardSkeleton() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <div style={{ width: 240, flexShrink: 0 }} />
      <main style={{ flex: 1, padding: 24 }} className="shadcn-scope">
        {/* Top bar - title + new article button */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-36 rounded-md" />
        </div>

        {/* KPI grid - 10 stat cards in 5/2 layout */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-6 w-12" />
              </div>
              <Skeleton className="mt-3 h-4 w-20" />
            </div>
          ))}
        </div>

        {/* Quick action tiles - 4 in a row */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-white p-5 text-center shadow-sm">
              <Skeleton className="mx-auto h-8 w-8 rounded-full" />
              <Skeleton className="mx-auto mt-2 h-4 w-24" />
            </div>
          ))}
        </div>

        {/* Recent Articles card */}
        <div className="rounded-lg bg-white shadow-sm">
          <div className="flex items-center justify-between border-b p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-60" />
              <Skeleton className="h-9 w-20" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex h-12 items-center gap-3 border-b last:border-b-0">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ms-auto h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Card-grid skeleton - square cards in a responsive grid. Used for
 * Page Builder, ePaper Analytics, anywhere the page renders a small
 * set of large cards instead of a table.
 */
export function CardGridSkeleton({
  title,
  subtitle,
  cards = 3,
}: {
  title?: string;
  subtitle?: string;
  cards?: number;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <div style={{ width: 240, flexShrink: 0 }} />
      <main style={{ flex: 1, padding: "24px 28px" }} className="shadcn-scope">
        <PageHeader title={title} subtitle={subtitle} />
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="ms-auto h-5 w-8 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * Form skeleton - fielded layout used for Settings / Profile / single-row
 * edit forms.
 */
export function FormSkeleton({
  title,
  subtitle,
  fields = 6,
}: {
  title?: string;
  subtitle?: string;
  fields?: number;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <div style={{ width: 240, flexShrink: 0 }} />
      <main style={{ flex: 1, padding: 24 }} className="shadcn-scope">
        <PageHeader title={title} subtitle={subtitle} />
        <div className="max-w-3xl space-y-6 rounded-lg border bg-white p-6 shadow-sm">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * ePaper editor skeleton - three-pane shell (palette + canvas + config).
 * Matches the rough layout of /epaper so the canvas doesn't jump in.
 */
export function EditorShellSkeleton({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      <div style={{ width: 240, flexShrink: 0 }} />
      <main style={{ flex: 1, padding: 16 }} className="shadcn-scope">
        <PageHeader title={title} subtitle={subtitle} />

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-32" />
          <div className="ms-auto flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </div>

        {/* Three-pane shell */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "220px 1fr 280px" }}>
          {/* Palette */}
          <div className="space-y-2 rounded-lg border bg-white p-3 shadow-sm">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
          {/* Canvas */}
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="grid h-[480px] grid-cols-3 gap-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-full w-full rounded-md" />
              ))}
            </div>
          </div>
          {/* Config */}
          <div className="space-y-3 rounded-lg border bg-white p-3 shadow-sm">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
