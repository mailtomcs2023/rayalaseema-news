import { CardGridSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <CardGridSkeleton
      title="Page Builder"
      subtitle="Loading templates, assignments, and composite blocks…"
      cards={3}
    />
  );
}
