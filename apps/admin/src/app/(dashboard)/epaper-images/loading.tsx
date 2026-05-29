import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="ePaper Images" subtitle="Loading image library…" rows={8} />;
}
