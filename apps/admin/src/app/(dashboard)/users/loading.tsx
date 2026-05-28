import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Users" subtitle="Loading accounts…" rows={8} />;
}
