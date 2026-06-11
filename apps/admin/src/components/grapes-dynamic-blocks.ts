// Dynamic (data-bound) card block for the GrapesJS visual editor.
//
// The block is an editable card TEMPLATE inside a wrapper that carries a data
// SOURCE + filters. The admin designs the card, then selects any element and
// picks a FIELD to bind it to ("Bind to field" trait → data-rsn-bind). A live
// item is bound in for preview. On the public page (apps/web visual-dynamic-
// blocks.ts) the card is cloned per item from the source and each bound element
// filled. Keep sources + fields in sync with that renderer + the preview API.
import type { Editor } from "grapesjs";
import { confirm } from "@/components/confirm-dialog";

const EDITOR_CSS = `
:root { --font-telugu-heading: "Anek Telugu", "Noto Sans Telugu", sans-serif; --font-telugu-body: "Noto Sans Telugu", sans-serif; }
body { font-family: var(--font-telugu-body); }
.rsn-ln-card { display: flex; flex-direction: column; text-decoration: none; color: inherit; background: #fff; border: 1px solid #ececec; border-radius: 10px; overflow: hidden; }
.rsn-ln-img { aspect-ratio: 16/9; background: #e9ebef; overflow: hidden; }
.rsn-ln-img img, img.rsn-ln-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rsn-ln-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.rsn-ln-title { font-family: var(--font-telugu-heading, system-ui), system-ui, sans-serif; font-size: 16px; font-weight: 700; line-height: 1.35; color: #111827; margin: 0; }
.rsn-ln-summary { font-size: 13px; line-height: 1.55; color: #6b7280; margin: 0; }
.rsn-ln-meta { font-size: 11px; font-weight: 600; color: #9ca3af; margin-top: auto; }
.rsn-ln-meta b { color: #E01B1B; }
[data-rsn-block="latest-news"] { min-height: 40px; }
`;

const DEFAULT_TEMPLATE =
  `<a class="rsn-ln-card" data-rsn-card href="#" onclick="return false">` +
    `<div class="rsn-ln-img" data-rsn-bind="image"><img alt=""/></div>` +
    `<div class="rsn-ln-body">` +
      `<h3 class="rsn-ln-title" data-rsn-bind="title">వార్త శీర్షిక ఇక్కడ</h3>` +
      `<p class="rsn-ln-summary" data-rsn-bind="summary">వార్త సంక్షిప్త సారాంశం ఇక్కడ కనిపిస్తుంది.</p>` +
      `<span class="rsn-ln-meta" data-rsn-bind="category"><b>విభాగం</b> · ఇప్పుడే</span>` +
    `</div>` +
  `</a>`;

const GRID_ICON =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}
function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ఇప్పుడే";
  if (m < 60) return `${m} నిమి.`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} గం.`;
  return `${Math.floor(h / 24)} రోజులు`;
}

type PreviewItem = { title: string; summary?: string | null; body?: string | null; image?: string | null; category?: string; author?: string; views?: number; publishedAt?: string | null };

// Walk up to the dynamic-card wrapper (or null).
export function findWrapper(cmp: any): any {
  let p = cmp;
  while (p) { if (p.getAttributes?.()?.["data-rsn-block"] === "latest-news") return p; p = p.parent?.(); }
  return null;
}

function applyGrid(cmp: any): void {
  const a = cmp.getAttributes();
  const cols = clamp(Number(a["data-columns"]) || 3, 1, 6);
  const gap = clamp(Number(a["data-gap"]) || 20, 0, 64);
  cmp.setStyle({ display: "grid", "grid-template-columns": `repeat(${cols}, minmax(0,1fr))`, gap: `${gap}px`, "padding-top": "6px" });
}

// Bind one element (in the editor model) to a field of the preview item.
function bindFieldEditor(el: any, field: string, it: PreviewItem): void {
  switch (field) {
    case "title": el.components(esc(it.title)); break;
    case "summary": el.components(it.summary ? esc(it.summary) : ""); break;
    case "body": el.components(it.body || ""); break;
    case "category": el.components(it.category ? esc(it.category) : ""); break;
    case "author": el.components(it.author ? esc(it.author) : ""); break;
    case "date": el.components(timeAgo(it.publishedAt)); break;
    case "views": el.components(String(it.views ?? 0)); break;
    case "image": {
      const img = el.get("tagName") === "img" ? el : el.find("img")[0];
      if (img && it.image) img.addAttributes({ src: it.image });
      break;
    }
    // link: no-op in the editor preview
  }
}

export function loadPreview(cmp: any): void {
  const a = cmp.getAttributes();
  const source = String(a["data-source"] || "latest");
  const cat = String(a["data-category"] || "").trim();
  const featured = String(a["data-featured"] || "") === "1" ? 1 : 0;
  fetch(`/api/page-builder/visual/latest-news?source=${source}&category=${encodeURIComponent(cat)}&count=1&featured=${featured}`, { credentials: "same-origin" })
    .then((r: Response) => (r.ok ? r.json() : null))
    .then((d: { items?: PreviewItem[] } | null) => {
      const it = d?.items?.[0];
      if (!it) return;
      cmp.find("[data-rsn-bind]").forEach((el: any) => bindFieldEditor(el, String(el.getAttributes()["data-rsn-bind"] || ""), it));
    })
    .catch(() => {});
}

function setupBlock(cmp: any): void {
  if (!cmp.components().length) cmp.components(DEFAULT_TEMPLATE);
  [cmp, ...cmp.find("[data-rsn-card], .rsn-ln-card, .rsn-ln-body")].forEach((c: any) => c?.set?.({ droppable: true }));
  applyGrid(cmp);
  loadPreview(cmp);
  cmp.on("change:attributes:data-columns change:attributes:data-gap", () => applyGrid(cmp));
  cmp.on("change:attributes:data-source change:attributes:data-category change:attributes:data-count change:attributes:data-featured", () => loadPreview(cmp));
}

export function registerDynamicBlocks(editor: Editor): void {
  let ready = false;

  // Replace the preset's native window.confirm() on "clear canvas" with the
  // app's shadcn AlertDialog (no native dialogs).
  editor.Commands.add("canvas-clear", {
    async run(ed: any) {
      const ok = await confirm({
        title: "Clear the canvas?",
        description: "This removes everything on the page. You can't undo this.",
        confirmText: "Clear",
        destructive: true,
      });
      if (!ok) return;
      ed.DomComponents.clear();
      ed.CssComposer.clear();
      ed.UndoManager?.clear?.();
    },
  });

  editor.on("load", () => {
    ready = true;
    const doc = editor.Canvas.getDocument();
    if (doc && !doc.getElementById("rsn-ln-editor-style")) {
      // Load the same Telugu fonts the public site uses (Anek Telugu headings,
      // Noto Sans Telugu body) into the canvas iframe so text matches the live page.
      const link = doc.createElement("link");
      link.id = "rsn-ln-editor-fonts";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Anek+Telugu:wght@400..800&family=Noto+Sans+Telugu:wght@400..700&display=swap";
      doc.head.appendChild(link);
      const s = doc.createElement("style");
      s.id = "rsn-ln-editor-style";
      s.textContent = EDITOR_CSS;
      doc.head.appendChild(s);
    }
    editor.getWrapper()?.find('[data-rsn-block="latest-news"]').forEach((cmp: any) => setupBlock(cmp));
  });

  editor.on("component:add", (cmp: any) => {
    if (ready && cmp?.get?.("type") === "rsn-latest-news") setupBlock(cmp);
  });

  // NOTE: the Source / filters / "Bind to field" controls render in the shadcn
  // Properties panel (grapes-dynamic-props.tsx), not as GrapesJS traits.

  const latestNews: any = {
    isComponent: (el: HTMLElement) =>
      el?.getAttribute?.("data-rsn-block") === "latest-news" ? { type: "rsn-latest-news" } : undefined,
    model: {
      defaults: {
        name: "Dynamic Cards",
        attributes: {
          "data-rsn-block": "latest-news",
          "data-source": "latest",
          "data-category": "",
          "data-count": 6,
          "data-columns": 3,
          "data-gap": 20,
          "data-featured": "0",
        },
        components: DEFAULT_TEMPLATE,
      },
    },
  };

  editor.Components.addType("rsn-latest-news", latestNews);
  editor.BlockManager.add("rsn-latest-news", {
    label: "Dynamic Cards",
    category: "Dynamic",
    media: GRID_ICON,
    content: { type: "rsn-latest-news" },
  });
}
