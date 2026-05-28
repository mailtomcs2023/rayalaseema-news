import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Categories" subtitle="Loading categories…" rows={6} />;
}
