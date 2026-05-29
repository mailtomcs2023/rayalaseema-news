import { CardGridSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <CardGridSkeleton title="ePaper Analytics" subtitle="Loading dashboards…" cards={6} />;
}
