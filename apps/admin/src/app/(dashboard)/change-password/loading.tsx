import { FormSkeleton } from "@/components/skeletons";

// Change-password is a tiny 3-field form, but FormSkeleton's neutral
// chrome reads as a loading state without the sidebar (the page itself
// uses its own lockdown layout - the 240px sidebar gutter just looks like
// padding while the real screen mounts).
export default function Loading() {
  return <FormSkeleton title="Change password" fields={3} />;
}
