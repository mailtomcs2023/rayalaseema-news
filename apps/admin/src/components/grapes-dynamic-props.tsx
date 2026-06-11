"use client";

// Shadcn Properties panel for the dynamic card block. GrapesJS's own traits are
// plain DOM, so we render our own controls here (mounted above the trait dock in
// the editor's Properties tab) and drive the selected component's attributes.
// - Card wrapper selected → Source + filters (category / featured / count / cols / gap).
// - An element inside the card selected → "Bind to field".
// Writing attributes triggers the listeners in grapes-dynamic-blocks (preview/grid).

import { useEffect, useState, type ReactNode } from "react";
import type { Editor } from "grapesjs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { findWrapper, loadPreview } from "@/components/grapes-dynamic-blocks";

const SOURCES: [string, string][] = [
  ["latest", "Latest articles"], ["featured", "Featured articles"], ["breaking", "Breaking news"],
  ["video", "Videos"], ["reel", "Reels"], ["gallery", "Photo galleries"], ["story", "Web stories"],
  ["cartoon", "Cartoons"], ["categories", "Categories"],
];
const FIELDS: [string, string][] = [
  ["title", "Title"], ["summary", "Summary"], ["body", "Body (full)"], ["image", "Image"],
  ["category", "Category"], ["author", "Author"], ["date", "Date"], ["views", "Views"], ["link", "Link (URL)"],
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function DynamicCardProps({ editor }: { editor: Editor }) {
  const [sel, setSel] = useState<any>(null);
  const [, bump] = useState(0);
  const [cats, setCats] = useState<{ name: string; slug: string }[]>([]);

  useEffect(() => {
    const sync = () => setSel(editor.getSelected() ?? null);
    editor.on("component:selected component:deselected", sync);
    sync();
    return () => {
      editor.off("component:selected component:deselected", sync);
    };
  }, [editor]);

  useEffect(() => {
    fetch("/api/page-builder/visual/categories", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { categories?: { name: string; slug: string }[] } | null) => {
        if (d?.categories) setCats(d.categories);
      })
      .catch(() => {});
  }, []);

  if (!sel) return null;
  const wrapper = findWrapper(sel);
  if (!wrapper) return null; // not a dynamic card or one of its children

  const attrs: Record<string, unknown> = sel.getAttributes?.() ?? {};
  const isWrapper = attrs["data-rsn-block"] === "latest-news";
  const set = (k: string, v: string | number) => {
    sel.addAttributes({ [k]: v });
    bump((n) => n + 1);
    if (k === "data-rsn-bind") loadPreview(wrapper); // refresh the bound preview
  };

  if (isWrapper) {
    return (
      <div className="flex flex-col gap-3 px-3 pt-3 pb-1">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Data source</div>
        <Field label="Source">
          <Select value={String(attrs["data-source"] || "latest")} onValueChange={(v) => set("data-source", v)}>
            <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {String(attrs["data-source"] || "latest") !== "categories" && (
          <Field label="Category filter">
            <Select value={String(attrs["data-category"] || "") || "all"} onValueChange={(v) => set("data-category", v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {cats.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={String(attrs["data-featured"] || "") === "1"} onCheckedChange={(c) => set("data-featured", c ? "1" : "0")} /> Featured only
        </label>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Count"><Input className="h-8 text-[13px]" type="number" min={1} max={30} value={Number(attrs["data-count"]) || 6} onChange={(e) => set("data-count", Number(e.target.value))} /></Field>
          <Field label="Columns"><Input className="h-8 text-[13px]" type="number" min={1} max={6} value={Number(attrs["data-columns"]) || 3} onChange={(e) => set("data-columns", Number(e.target.value))} /></Field>
          <Field label="Gap"><Input className="h-8 text-[13px]" type="number" min={0} max={64} value={Number(attrs["data-gap"]) || 20} onChange={(e) => set("data-gap", Number(e.target.value))} /></Field>
        </div>
      </div>
    );
  }

  const bindVal = String(attrs["data-rsn-bind"] || "") || "none";
  return (
    <div className="flex flex-col gap-2 px-3 pt-3 pb-1">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dynamic binding</div>
      <Field label="Bind to field">
        <Select value={bindVal} onValueChange={(v) => set("data-rsn-bind", v === "none" ? "" : v)}>
          <SelectTrigger className="h-8 text-[13px]"><SelectValue placeholder="- none -" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">- none -</SelectItem>
            {FIELDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <p className="text-[11px] text-muted-foreground">This element shows the selected field for every item.</p>
    </div>
  );
}
