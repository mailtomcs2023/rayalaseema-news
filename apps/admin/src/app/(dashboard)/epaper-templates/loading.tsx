import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="ePaper Templates" subtitle="Loading…" rows={8} />;
}
