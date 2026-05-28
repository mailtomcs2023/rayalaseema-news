import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Desks" subtitle="Loading desks…" rows={6} />;
}
