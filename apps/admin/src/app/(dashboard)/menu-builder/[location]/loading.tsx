import { EditorShellSkeleton } from "@/components/skeletons";

// Menu builder is a 3-pane shell (palette / tree / config) - same shape as
// the ePaper editor, so reuse the same skeleton variant.
export default function Loading() {
  return <EditorShellSkeleton title="Menu Builder" subtitle="Loading menu…" />;
}
