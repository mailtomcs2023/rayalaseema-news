import { FormSkeleton } from "@/components/skeletons";

export default function Loading() {
  return <FormSkeleton title="Settings" subtitle="Loading…" fields={8} />;
}
