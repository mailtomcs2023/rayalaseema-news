import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Audit Log" subtitle="Loading entries…" rows={10} />;
}
