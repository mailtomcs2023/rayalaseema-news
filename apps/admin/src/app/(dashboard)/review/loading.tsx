import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Review Queue" subtitle="Loading review queue…" rows={8} />;
}
