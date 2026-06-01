// Group-level loading fallback. Used by:
//   1. The dashboard root (/) - page.tsx is in this folder
//   2. Any child route that doesn't have its own loading.tsx as a safety net
//
// DashboardSkeleton mirrors the dashboard root's chrome (KPI cards + quick
// actions + recent articles). Other pages override with their own
// loading.tsx so they don't briefly show a dashboard shape.
import { DashboardSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <DashboardSkeleton />;
}
