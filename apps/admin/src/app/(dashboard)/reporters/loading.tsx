import { TableSkeleton } from "@/components/table-skeleton";

export default function Loading() {
  return <TableSkeleton title="Reporters & KYC" subtitle="Loading reporters…" rows={8} />;
}
