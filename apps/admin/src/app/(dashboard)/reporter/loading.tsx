import { CardGridSkeleton } from "@/components/skeletons";

// Reporter portal home - KPI cards + article list. Use the card-grid
// variant since the page's chrome is mostly cards (KYC banner + 3 KPI
// tiles + article previews) rather than a dense table.
export default function Loading() {
  return <CardGridSkeleton title="Welcome" subtitle="Loading your portal…" cards={3} />;
}
