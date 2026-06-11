"use client";

// Client boundary that loads the GrapesJS editor with { ssr: false } - GrapesJS
// touches the DOM at import, so it must never run on the server.
import dynamic from "next/dynamic";

const GrapesEditor = dynamic(
  () => import("@/components/grapes-editor").then((m) => m.GrapesEditor),
  { ssr: false, loading: () => <div style={{ padding: 40, color: "#9ca3af" }}>Loading editor…</div> },
);

export function VisualEditorClient(props: {
  id: string;
  name: string;
  slug: string;
  initialProject: unknown | null;
  html?: string | null;
  css?: string | null;
  webUrl: string;
}) {
  return <GrapesEditor {...props} />;
}
