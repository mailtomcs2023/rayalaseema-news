import { FormSkeleton } from "@/components/skeletons";

// KYC onboarding is a long form (Identity / Documents / Bank). 9 fields
// covers the most-visible chunk above the fold.
export default function Loading() {
  return <FormSkeleton title="Complete your KYC" subtitle="Loading…" fields={9} />;
}
