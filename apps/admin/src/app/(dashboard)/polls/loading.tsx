import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Polls" subtitle="Loading…" rows={8} />;
}
