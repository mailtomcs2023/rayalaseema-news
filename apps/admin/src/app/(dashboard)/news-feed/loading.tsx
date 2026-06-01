import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="News Feed" subtitle="Loading…" rows={6} />;
}
