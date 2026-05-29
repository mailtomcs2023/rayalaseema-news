import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Profile Change Requests" subtitle="Loading…" rows={8} />;
}
