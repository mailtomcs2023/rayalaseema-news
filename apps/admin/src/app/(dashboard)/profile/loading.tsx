import { FormSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <FormSkeleton title="Profile" subtitle="Loading…" fields={6} />;
}
