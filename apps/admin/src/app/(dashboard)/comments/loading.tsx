import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Comments" subtitle="Loading moderation queue…" rows={10} />;
}
