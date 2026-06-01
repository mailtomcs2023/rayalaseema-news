import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Mandi Prices" subtitle="Loading…" rows={8} />;
}
