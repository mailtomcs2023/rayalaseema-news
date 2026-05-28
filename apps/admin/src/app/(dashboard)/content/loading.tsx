import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Content" subtitle="Loading articles…" rows={10} />;
}
