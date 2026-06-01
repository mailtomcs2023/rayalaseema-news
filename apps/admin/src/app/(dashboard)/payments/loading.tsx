import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Payments" subtitle="Loading payments…" rows={10} />;
}
