// TableSkeleton - visual placeholder shown while a TanStack table page is
// loading. Mirrors the structural rhythm of /content, /users, /reporters,
// /categories etc. so the swap-in feels instant rather than jarring.
//
// Used as Next.js loading.tsx fallback per route - Suspense renders this
// while the underlying page's data fetch is in flight. Result: the user
// always sees the chrome (sidebar, page title, filter bar) within ~50ms,
// then the rows fade in.
import { Skeleton } from "@/components/ui/skeleton";

export interface TableSkeletonProps {
  /** How many placeholder rows to draw. Default 8 - about half a page. */
  rows?: number;
  /** Optional title shown above the skeleton, e.g. "Content" or "Users". */
  title?: string;
  /** Subtitle line under the title. */
  subtitle?: string;
}

export function TableSkeleton({ rows = 8, title, subtitle }: TableSkeletonProps) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f3f4f6" }}>
      {/* Sidebar placeholder - width matches the real Sidebar component so
          the page body doesn't jump when the real chrome mounts. */}
      <div style={{ width: 240, flexShrink: 0 }} />

      <main style={{ flex: 1, padding: 24 }}>
        {(title || subtitle) && (
          <div className="mb-5 space-y-2">
            {title && (
              <h1 style={{ fontSize: 24, fontWeight: 800, color: "#111", margin: 0 }}>
                {title}
              </h1>
            )}
            {subtitle && (
              <p style={{ fontSize: 13, color: "#888", margin: 0 }}>{subtitle}</p>
            )}
          </div>
        )}

        {/* Toolbar row - search + filter + view + action buttons. */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-60" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-20" />
          <div className="ms-auto flex items-center gap-2">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>

        {/* Table card. */}
        <div className="overflow-hidden rounded-md border bg-background">
          {/* Header row. */}
          <div className="flex h-11 items-center gap-3 border-b px-4">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="ms-auto h-4 w-16" />
          </div>
          {/* Body rows. */}
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex h-14 items-center gap-3 border-b px-4 last:border-b-0"
            >
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="ms-auto h-7 w-7" />
            </div>
          ))}
        </div>

        {/* Pagination row. */}
        <div className="mt-4 flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </main>
    </div>
  );
}
