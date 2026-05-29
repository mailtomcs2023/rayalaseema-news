import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Ads" subtitle="Loading…" rows={8} />;
}
