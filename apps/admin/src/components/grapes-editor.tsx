"use client";

// GrapesJS free-form visual editor (Spec: visual pages). Webflow-style canvas:
// drag Section/Div/Grid/Columns/Heading/Text/Image, full Style Manager
// (opacity/filters/borders/radius/blend/spacing), Layers, device preview. Saves
// the GrapesJS project (source of truth) + exported HTML/CSS (for public render).
//
// Layout: Blocks + Layers docked LEFT, Style + Settings docked RIGHT, canvas in
// the middle. We disable the preset's default (right-stacked) panels and mount
// each manager into our own containers via appendTo.
//
// Loaded via next/dynamic with { ssr: false } - GrapesJS needs the DOM.

import { useEffect, useRef, useState, type ReactNode } from "react";
import grapesjs, { type Editor } from "grapesjs";
import presetWebpage from "grapesjs-preset-webpage";
import { registerDynamicBlocks } from "./grapes-dynamic-blocks";
import { DynamicCardProps } from "./grapes-dynamic-props";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { WithTooltip } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import "grapesjs/dist/css/grapes.min.css";
// grapesjs-preset-webpage@1.0.3 ships JS only (no separate CSS bundle); its
// styles are injected at runtime by the plugin, so there is nothing to import.

interface Props {
  id: string;
  name: string;
  slug: string;
  initialProject: unknown | null;
  html?: string | null;
  css?: string | null;
  webUrl: string;
}

// Block palette. preset-webpage 1.0.3 only ships 3 blocks, so we register the
// full set ourselves (Layout / Basic / Media / Forms / Navigation) as plain
// HTML blocks - no extra plugins/deps needed. Each gets an inline SVG icon.
// Lucide icon paths (https://lucide.dev), the same set shadcn uses. GrapesJS
// block `media` expects an SVG string, so we wrap the official path data.
const svg = (path: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

const ICON = {
  section: svg(`<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/>`), // layout-template
  div: svg(`<rect width="18" height="18" x="3" y="3" rx="2"/>`), // square
  col1: svg(`<rect width="12" height="20" x="6" y="2" rx="2"/>`), // rectangle-vertical
  col2: svg(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>`), // columns-2
  col3: svg(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>`), // columns-3
  col37: svg(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>`), // panel-left
  grid: svg(`<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>`), // layout-grid
  divider: svg(`<path d="M5 12h14"/>`), // minus
  heading: svg(`<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>`), // heading
  text: svg(`<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>`), // type
  link: svg(`<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`), // link
  button: svg(`<path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"/><path d="m12 12 4 10 1.7-4.3L22 16Z"/>`), // square-mouse-pointer
  image: svg(`<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`), // image
  video: svg(`<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/>`), // video
  map: svg(`<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>`), // map-pin
  icon: svg(`<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`), // star
  form: svg(`<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>`), // clipboard-list
  input: svg(`<path d="M5 4h1a3 3 0 0 1 3 3 3 3 0 0 1 3-3h1"/><path d="M13 20h-1a3 3 0 0 1-3-3 3 3 0 0 1-3 3H5"/><path d="M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1"/><path d="M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7"/><path d="M9 7v10"/>`), // text-cursor-input
  textarea: svg(`<path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18H3"/>`), // text
  select: svg(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m16 10-4 4-4-4"/>`), // square-chevron-down
  label: svg(`<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>`), // tag
  checkbox: svg(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>`), // square-check
  radio: svg(`<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>`), // circle-dot
  navbar: svg(`<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>`), // panel-top
};

function registerBlocks(editor: Editor) {
  const bm = editor.BlockManager;
  const add = (id: string, label: string, category: string, content: unknown, media: string) =>
    bm.add(id, { label, category, content: content as never, media });

  // ---- Layout ----
  add("rsn-section", "Section", "Layout", `<section style="padding:48px 24px"><div style="max-width:1100px;margin:0 auto;min-height:40px"></div></section>`, ICON.section);
  add("rsn-div", "Div", "Layout", `<div style="padding:16px;min-height:40px"></div>`, ICON.div);
  add("rsn-col1", "1 Column", "Layout", `<div style="display:flex;padding:8px;min-height:60px"><div style="flex:1;padding:8px;min-height:44px"></div></div>`, ICON.col1);
  add("rsn-col2", "2 Columns", "Layout", `<div style="display:flex;gap:16px;padding:8px;min-height:60px"><div style="flex:1;padding:8px;min-height:44px"></div><div style="flex:1;padding:8px;min-height:44px"></div></div>`, ICON.col2);
  add("rsn-col3", "3 Columns", "Layout", `<div style="display:flex;gap:16px;padding:8px;min-height:60px"><div style="flex:1;padding:8px;min-height:44px"></div><div style="flex:1;padding:8px;min-height:44px"></div><div style="flex:1;padding:8px;min-height:44px"></div></div>`, ICON.col3);
  add("rsn-col37", "2 Columns 3:7", "Layout", `<div style="display:flex;gap:16px;padding:8px;min-height:60px"><div style="flex:3;padding:8px;min-height:44px"></div><div style="flex:7;padding:8px;min-height:44px"></div></div>`, ICON.col37);
  add("rsn-grid", "Grid (3)", "Layout", `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px"><div style="min-height:60px"></div><div style="min-height:60px"></div><div style="min-height:60px"></div></div>`, ICON.grid);
  add("rsn-divider", "Divider", "Layout", `<hr style="border:none;border-top:1px solid #d1d5db;margin:20px 0"/>`, ICON.divider);

  // ---- Basic ----
  add("rsn-heading", "Heading", "Basic", `<h2 style="font-size:28px;font-weight:800;margin:0 0 8px">Heading</h2>`, ICON.heading);
  add("rsn-text", "Text", "Basic", `<p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 8px">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>`, ICON.text);
  add("rsn-link", "Link", "Basic", `<a href="#" style="color:#FF2C2C;text-decoration:underline">Link</a>`, ICON.link);
  add("rsn-button", "Button", "Basic", `<a style="display:inline-block;padding:10px 20px;background:#FF2C2C;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Button</a>`, ICON.button);

  // ---- Media ----
  add("rsn-image", "Image", "Media", { type: "image" }, ICON.image);
  add("rsn-video", "Video", "Media", { type: "video", src: "", style: { height: "320px", width: "100%" } }, ICON.video);
  add("rsn-map", "Map", "Media", `<iframe frameborder="0" style="width:100%;height:320px;border:0" src="https://maps.google.com/maps?q=India&z=5&output=embed"></iframe>`, ICON.map);
  add("rsn-icon", "Icon", "Media", `<span style="display:inline-flex;font-size:36px;line-height:1;color:#FF2C2C">★</span>`, ICON.icon);

  // ---- Forms ----
  add("rsn-form", "Form", "Forms", `<form style="padding:12px;display:flex;flex-direction:column;gap:10px"><input type="text" placeholder="Name" style="padding:8px;border:1px solid #d1d5db;border-radius:6px"/><textarea placeholder="Message" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;min-height:80px"></textarea><button type="submit" style="padding:10px 18px;background:#FF2C2C;color:#fff;border:none;border-radius:6px;font-weight:600;align-self:flex-start">Submit</button></form>`, ICON.form);
  add("rsn-input", "Input", "Forms", `<input type="text" placeholder="Text input" style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px"/>`, ICON.input);
  add("rsn-textarea", "Textarea", "Forms", `<textarea placeholder="Text area" style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;min-height:90px;width:240px"></textarea>`, ICON.textarea);
  add("rsn-select", "Select", "Forms", `<select style="padding:8px 10px;border:1px solid #d1d5db;border-radius:6px"><option>Option 1</option><option>Option 2</option><option>Option 3</option></select>`, ICON.select);
  add("rsn-label", "Label", "Forms", `<label style="font-size:14px;font-weight:600;color:#374151">Label</label>`, ICON.label);
  add("rsn-checkbox", "Checkbox", "Forms", `<label style="display:inline-flex;align-items:center;gap:8px;font-size:14px"><input type="checkbox"/> Checkbox</label>`, ICON.checkbox);
  add("rsn-radio", "Radio", "Forms", `<label style="display:inline-flex;align-items:center;gap:8px;font-size:14px"><input type="radio" name="r"/> Radio</label>`, ICON.radio);

  // ---- Navigation ----
  add("rsn-navbar", "Navbar", "Navigation", `<nav style="display:flex;align-items:center;justify-content:space-between;padding:14px 28px;background:#fff;border-bottom:1px solid #eee"><div style="font-weight:800;font-size:18px">Brand</div><div style="display:flex;gap:20px"><a href="#" style="color:#374151;text-decoration:none">Home</a><a href="#" style="color:#374151;text-decoration:none">About</a><a href="#" style="color:#374151;text-decoration:none">Contact</a></div></nav>`, ICON.navbar);

  // ---- Sections (pre-built, ready to drop & edit) ----
  add("rsn-hero", "Hero", "Sections", `<section style="padding:72px 24px;text-align:center;background:#fff7f7"><div style="max-width:720px;margin:0 auto"><h1 style="font-size:42px;line-height:1.15;font-weight:800;margin:0 0 16px;color:#111827">Your headline goes here</h1><p style="font-size:18px;line-height:1.6;color:#4b5563;margin:0 0 28px">A short supporting sentence that explains the value in one or two lines.</p><a href="#" style="display:inline-block;padding:14px 28px;background:#FF2C2C;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px">Get started</a></div></section>`, ICON.section);
  add("rsn-features", "Feature Grid", "Sections", `<section style="padding:56px 24px;background:#fff"><div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:28px"><div style="text-align:center;padding:8px"><div style="font-size:32px;color:#FF2C2C;margin-bottom:12px">★</div><h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#111827">Feature one</h3><p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0">Describe the feature in a sentence or two so readers know what they get.</p></div><div style="text-align:center;padding:8px"><div style="font-size:32px;color:#FF2C2C;margin-bottom:12px">★</div><h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#111827">Feature two</h3><p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0">Describe the feature in a sentence or two so readers know what they get.</p></div><div style="text-align:center;padding:8px"><div style="font-size:32px;color:#FF2C2C;margin-bottom:12px">★</div><h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:#111827">Feature three</h3><p style="font-size:14px;line-height:1.6;color:#6b7280;margin:0">Describe the feature in a sentence or two so readers know what they get.</p></div></div></section>`, ICON.grid);
  add("rsn-cardrow", "Card Row", "Sections", `<section style="padding:48px 24px;background:#f9fafb"><div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:24px"><div style="background:#fff;border:1px solid #eee;border-radius:10px;overflow:hidden"><div style="aspect-ratio:16/9;background:#e5e7eb"></div><div style="padding:16px"><h3 style="font-size:16px;font-weight:700;margin:0 0 6px;color:#111827">Card title here</h3><p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 10px">A short description for this card goes right here.</p><a href="#" style="color:#FF2C2C;font-weight:600;font-size:13px;text-decoration:none">Read more →</a></div></div><div style="background:#fff;border:1px solid #eee;border-radius:10px;overflow:hidden"><div style="aspect-ratio:16/9;background:#e5e7eb"></div><div style="padding:16px"><h3 style="font-size:16px;font-weight:700;margin:0 0 6px;color:#111827">Card title here</h3><p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 10px">A short description for this card goes right here.</p><a href="#" style="color:#FF2C2C;font-weight:600;font-size:13px;text-decoration:none">Read more →</a></div></div><div style="background:#fff;border:1px solid #eee;border-radius:10px;overflow:hidden"><div style="aspect-ratio:16/9;background:#e5e7eb"></div><div style="padding:16px"><h3 style="font-size:16px;font-weight:700;margin:0 0 6px;color:#111827">Card title here</h3><p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 10px">A short description for this card goes right here.</p><a href="#" style="color:#FF2C2C;font-weight:600;font-size:13px;text-decoration:none">Read more →</a></div></div></div></section>`, ICON.grid);
  add("rsn-cta", "CTA Band", "Sections", `<section style="padding:56px 24px;background:#FF2C2C;text-align:center"><h2 style="font-size:28px;font-weight:800;color:#fff;margin:0 0 18px">Ready to get started?</h2><a href="#" style="display:inline-block;padding:13px 28px;background:#fff;color:#FF2C2C;border-radius:8px;text-decoration:none;font-weight:700">Contact us</a></section>`, ICON.button);
  add("rsn-twocol", "Text + Image", "Sections", `<section style="padding:56px 24px;background:#fff"><div style="max-width:1100px;margin:0 auto;display:flex;gap:40px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:280px"><h2 style="font-size:30px;font-weight:800;margin:0 0 14px;color:#111827">A section heading</h2><p style="font-size:16px;line-height:1.7;color:#4b5563;margin:0 0 20px">Two or three sentences of supporting copy that sit beside the image and explain the point clearly.</p><a href="#" style="display:inline-block;padding:12px 24px;background:#FF2C2C;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Learn more</a></div><div style="flex:1;min-width:280px;aspect-ratio:4/3;background:#e5e7eb;border-radius:12px"></div></div></section>`, ICON.col2);
  add("rsn-stats", "Stats", "Sections", `<section style="padding:48px 24px;background:#fff7f7"><div style="max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;text-align:center"><div><div style="font-size:36px;font-weight:800;color:#FF2C2C">10k+</div><div style="font-size:14px;color:#6b7280">Readers</div></div><div><div style="font-size:36px;font-weight:800;color:#FF2C2C">8</div><div style="font-size:14px;color:#6b7280">Districts</div></div><div><div style="font-size:36px;font-weight:800;color:#FF2C2C">24/7</div><div style="font-size:14px;color:#6b7280">Coverage</div></div><div><div style="font-size:36px;font-weight:800;color:#FF2C2C">500+</div><div style="font-size:14px;color:#6b7280">Stories</div></div></div></section>`, ICON.icon);
  add("rsn-newsletter", "Newsletter", "Sections", `<section style="padding:48px 24px;background:#111827;text-align:center"><h2 style="font-size:24px;font-weight:800;color:#fff;margin:0 0 8px">Subscribe to our newsletter</h2><p style="color:#9ca3af;margin:0 0 20px">Get the latest news in your inbox.</p><form style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><input type="email" placeholder="your@email.com" style="padding:12px 14px;border:none;border-radius:8px;min-width:260px"/><button type="submit" style="padding:12px 24px;background:#FF2C2C;color:#fff;border:none;border-radius:8px;font-weight:700">Subscribe</button></form></section>`, ICON.input);
  add("rsn-footer", "Footer", "Sections", `<footer style="padding:48px 24px 28px;background:#111827;color:#d1d5db"><div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:32px"><div><div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:10px">Brand</div><p style="font-size:13px;line-height:1.6;margin:0;color:#9ca3af">A short line about the brand or publication and what it covers.</p></div><div><div style="font-weight:700;color:#fff;margin-bottom:10px;font-size:14px">Company</div><div style="display:flex;flex-direction:column;gap:8px;font-size:13px"><a href="#" style="color:#9ca3af;text-decoration:none">About</a><a href="#" style="color:#9ca3af;text-decoration:none">Contact</a><a href="#" style="color:#9ca3af;text-decoration:none">Careers</a></div></div><div><div style="font-weight:700;color:#fff;margin-bottom:10px;font-size:14px">Legal</div><div style="display:flex;flex-direction:column;gap:8px;font-size:13px"><a href="#" style="color:#9ca3af;text-decoration:none">Privacy</a><a href="#" style="color:#9ca3af;text-decoration:none">Terms</a></div></div><div><div style="font-weight:700;color:#fff;margin-bottom:10px;font-size:14px">Follow</div><div style="display:flex;flex-direction:column;gap:8px;font-size:13px"><a href="#" style="color:#9ca3af;text-decoration:none">Facebook</a><a href="#" style="color:#9ca3af;text-decoration:none">Twitter</a><a href="#" style="color:#9ca3af;text-decoration:none">YouTube</a></div></div></div><div style="max-width:1100px;margin:28px auto 0;padding-top:18px;border-top:1px solid #374151;font-size:12px;color:#6b7280;text-align:center">© 2026 Brand. All rights reserved.</div></footer>`, ICON.navbar);
}

// Light theme override: GrapesJS ships a dark UI; recolor its four theme
// classes (one-bg/two-color/three-bg/four-color) + key components to the brand
// (white panels, slate text, #FF2C2C red accent). Scoped under .rsn-gjs.
const GJS_THEME = `
/* Hide number-input spinners inside our custom style panel. */
.rsn-gjs input[type=number]::-webkit-outer-spin-button,
.rsn-gjs input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.rsn-gjs input[type=number] { -moz-appearance: textfield; }

/* Hide only the native SELECTION overlay (.gjs-highlighter-sel) - we draw the
   persistent selection border ourselves via .rsn-active (see load handler), so
   keeping it would double up. Keep the native HOVER overlay (.gjs-highlighter)
   and color it blue for hover feedback. */
.rsn-gjs .gjs-highlighter-sel { display: none !important; }
.rsn-gjs .gjs-highlighter { outline-color: #2680eb !important; }
.rsn-gjs .gjs-editor, .rsn-gjs .gjs-one-bg { background-color: #ffffff; }
.rsn-gjs .gjs-two-color { color: #374151; }
.rsn-gjs .gjs-two-bg { background-color: #374151; }
.rsn-gjs .gjs-three-bg { background-color: #FF2C2C; color: #fff; }
.rsn-gjs .gjs-four-color, .rsn-gjs .gjs-four-color-h:hover { color: #FF2C2C; }

/* Studio-like gray canvas. NOTE: do not override the top/height here - GrapesJS
   offsets the canvas below its top command toolbar; forcing top:0 slides the
   canvas under the toolbar and hides the first component. */
.rsn-gjs .gjs-cv-canvas { background-color: #e9eaee; }

/* Block manager: one full-width card per row (icon left, label right). */
.rsn-gjs .gjs-blocks-c { background: #f9fafb; gap: 8px; padding: 10px; }
.rsn-gjs .gjs-block {
  width: 100%; min-height: 0; box-sizing: border-box; margin: 0;
  background: #ffffff; color: #374151; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: none;
  display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 11px; padding: 11px 14px;
}
.rsn-gjs .gjs-block:hover { color: #FF2C2C; border-color: #FF2C2C; box-shadow: 0 1px 4px rgba(255,44,44,.15); }
/* Lucide icons are stroke-based: keep fill:none, drive the stroke via color. */
.rsn-gjs .gjs-block svg { width: 22px; height: 22px; flex-shrink: 0; fill: none; stroke: currentColor; }
.rsn-gjs .gjs-block-label { color: inherit; font-size: 13px; font-weight: 500; text-align: left; }
.rsn-gjs .gjs-block-category .gjs-title { background: #f3f4f6; color: #111827; border: none; font-weight: 600; }

/* Style-manager sectors: clean collapsible rows (Studio-like) */
.rsn-gjs .gjs-sm-sector-title, .rsn-gjs .gjs-sm-sector .gjs-sm-title {
  background: #ffffff; color: #111827; border: none; border-bottom: 1px solid #f1f2f4;
  font-weight: 600; font-size: 12px; padding: 11px 12px;
}
.rsn-gjs .gjs-sm-sector { border: none; }
.rsn-gjs .gjs-sm-sector.gjs-sm-open .gjs-sm-title { color: #111827; }

/* Style manager fields + labels */
.rsn-gjs .gjs-sm-label, .rsn-gjs .gjs-label, .rsn-gjs .gjs-field-label { color: #374151; }
.rsn-gjs .gjs-field { background: #ffffff; border: 1px solid #d1d5db; color: #111827; border-radius: 6px; }
.rsn-gjs .gjs-field input, .rsn-gjs .gjs-field select, .rsn-gjs .gjs-field textarea { color: #111827; }
.rsn-gjs .gjs-sm-properties, .rsn-gjs .gjs-clm-tags { background: #ffffff; }
.rsn-gjs .gjs-clm-tags .gjs-clm-label, .rsn-gjs .gjs-clm-sels-info { color: #374151; }
.rsn-gjs .gjs-clm-tag { background: #FEF2F2; color: #B91C1C; }

/* Trait (settings) manager */
.rsn-gjs .gjs-trt-trait .gjs-label, .rsn-gjs .gjs-trt-traits .gjs-label { color: #374151; }

/* Layers panel */
.rsn-gjs .gjs-layer { border-bottom: 1px solid #f3f4f6; }
.rsn-gjs .gjs-layer-title-inn, .rsn-gjs .gjs-layer-name { color: #374151; font-weight: 500; }
.rsn-gjs .gjs-layer-count { color: #9ca3af; }
.rsn-gjs .gjs-layer-vis, .rsn-gjs .gjs-layer-move, .rsn-gjs .gjs-layer-caret { color: #9ca3af; }
.rsn-gjs .gjs-layer-title:hover { background: #f9fafb; }
.rsn-gjs .gjs-layer.gjs-selected > .gjs-layer-title,
.rsn-gjs .gjs-layer.gjs-selected .gjs-layer-title-inn { background: #FEF2F2; }
.rsn-gjs .gjs-layer.gjs-selected .gjs-layer-name { color: #B91C1C; }

/* Color/active accents */
.rsn-gjs .gjs-radio-item-active, .rsn-gjs .gjs-color-active { background-color: #FF2C2C; }
.rsn-gjs .gjs-badge, .rsn-gjs .gjs-toolbar { background-color: #FF2C2C; }
.rsn-gjs .gjs-resizer-h { border-color: #FF2C2C; background-color: #FF2C2C; }

/* Hide the preset's built-in device buttons - we provide our own working
   switcher in the React top bar (the preset's buttons were unreliable). */
.rsn-gjs .gjs-pn-devices-c { display: none; }

/* Remove the preset's redundant right-side panel buttons (open styles / traits
   / layers / blocks) and the empty reserved right dock they toggle - those
   managers already live in our own left/right docks. The canvas width is
   calc(100% - --gjs-left-width); that 15% is what the empty dock reserved, so
   zeroing it lets the canvas span the full width (the blank gap is reclaimed). */
.rsn-gjs { --gjs-left-width: 0px; }
.rsn-gjs .gjs-pn-views,
.rsn-gjs .gjs-pn-views-container { display: none; }
`;

// Our own device list - paired with the custom switcher buttons below so the
// names always match what setDevice() is called with.
const DEVICES = [
  { id: "Desktop", name: "Desktop", width: "" },
  { id: "Tablet", name: "Tablet", width: "768px", widthMedia: "992px" },
  { id: "Mobile", name: "Mobile", width: "375px", widthMedia: "575px" },
];

// Style Manager groups (Webflow/Studio-style) - replaces GrapesJS's default
// General/Dimension/Typography/Decorations/Extra sectors. Each `buildProps`
// name resolves to GrapesJS's built-in control for that CSS property (0.23
// ships flexbox + opacity etc. built in).
// NOTE: the "Layout" sector is intentionally omitted - it's rendered by our own
// shadcn <LayoutPanel> above the GrapesJS style manager (custom dropdowns).
const STYLE_SECTORS = [
  { name: "Size",       open: false, buildProps: ["width", "height", "min-width", "max-width", "min-height", "max-height"] },
  { name: "Space",      open: false, buildProps: ["margin", "padding"] },
  { name: "Position",   open: false, buildProps: ["position", "top", "right", "bottom", "left", "float", "z-index"] },
  { name: "Typography", open: false, buildProps: ["font-family", "font-size", "font-weight", "letter-spacing", "color", "line-height", "text-align", "text-decoration", "text-transform", "text-shadow"] },
  { name: "Background", open: false, buildProps: ["background-color", "background"] },
  { name: "Borders",    open: false, buildProps: ["border-radius", "border"] },
  { name: "Effects",    open: false, buildProps: ["opacity", "box-shadow", "transition", "transform", "cursor"] },
];

export function GrapesEditor({ id, name, slug, initialProject, html, css, webUrl }: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const traitRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBlocks, setShowBlocks] = useState(false);
  const [rightTab, setRightTab] = useState<"style" | "settings">("style");
  const [device, setDevice] = useState("Desktop");
  const [ed, setEd] = useState<Editor | null>(null);
  // Bumped whenever the selection / its styles / the device change, so the
  // custom shadcn LayoutPanel re-reads the current values from the editor.
  const [styleTick, setStyleTick] = useState(0);
  // Bumped on every undoable change so the top-bar Undo/Redo buttons re-read
  // hasUndo()/hasRedo() for their enabled state.
  const [, setHistTick] = useState(0);

  useEffect(() => {
    if (!canvasRef.current || editorRef.current) return;
    // GrapesJS appends each manager's UI into our own containers (appendTo) and
    // doesn't reliably clear them on destroy(). In dev the effect runs twice
    // (StrictMode / Fast Refresh), so without this a 2nd copy of the Selector
    // and Style managers gets stacked (the duplicate "Classes / Selected" block).
    // Empty the dock containers before (re)initialising so we never double up.
    const docks = [blocksRef, layersRef, selectorRef, styleRef, traitRef];
    docks.forEach((r) => { if (r.current) r.current.innerHTML = ""; });
    const editor = grapesjs.init({
      container: canvasRef.current,
      height: "100%",
      width: "auto",
      storageManager: false,
      // Dock each manager into our own left/right containers instead of the
      // preset's default right-stacked panels.
      panels: { defaults: [] },
      blockManager: { appendTo: blocksRef.current! },
      layerManager: { appendTo: layersRef.current! },
      selectorManager: { appendTo: selectorRef.current! },
      styleManager: { appendTo: styleRef.current!, sectors: STYLE_SECTORS as never },
      traitManager: { appendTo: traitRef.current! },
      deviceManager: { devices: DEVICES },
      // preset-webpage adds blocks (columns/text/image/link/video/map) + the
      // style-manager sectors + import/code commands.
      plugins: [presetWebpage],
      pluginsOpts: { "grapesjs-preset-webpage": {} },
    });
    editorRef.current = editor;
    setEd(editor);
    registerBlocks(editor);
    registerDynamicBlocks(editor);

    // ROOT CAUSE of the duplicate "Classes / Selected" block: with the selector
    // and style managers docked separately via appendTo, GrapesJS mounts the
    // class-tags view twice, so the Styles panel shows two identical selector
    // blocks. Keep only the first .gjs-clm-tags and remove the rest. Re-run on
    // selection changes since the class manager re-renders when selection moves.
    // The duplicate lives in the right Styles dock (selectorRef + styleRef share
    // a parent). Strip every class-manager part down to its FIRST occurrence -
    // header ("Classes" + state), tags ("quote +"), and the "Selected:" line -
    // so it collapses to one whether those are nested or siblings.
    const styleDock = () => selectorRef.current?.parentElement ?? null;
    const dedupeClassManager = () => {
      const dock = styleDock();
      if (!dock) return;
      [".gjs-clm-tags", ".gjs-clm-header", ".gjs-clm-sels-info"].forEach((sel) => {
        const els = dock.querySelectorAll(sel);
        for (let i = els.length - 1; i >= 1; i--) els[i].remove();
      });
    };
    // GrapesJS re-renders the class manager ASYNCHRONOUSLY on every selection
    // change, so a one-shot strip loses the race (why the earlier fix failed).
    // A MutationObserver collapses it back to one whenever the dock DOM changes.
    const clmObserver = new MutationObserver(() => dedupeClassManager());

    // The selected-component toolbar (move/copy/delete) is right-aligned to the
    // element with no lower bound, and the canvas is overflow:hidden - so for an
    // element flush against the left edge its left icons get a negative offset
    // and are clipped under the left dock. Clamp the toolbar's left back into
    // view whenever GrapesJS repositions it (selection, scroll, zoom).
    let toolbarObserver: MutationObserver | null = null;

    editor.on("load", () => {
      // Show component outlines in the editor by default (View components).
      editor.runCommand("sw-visibility");
      // Trim the canvas toolbar (preset "options" panel) to the actions we want
      // - keep the outlines toggle / clear. Remove preview (eye), fullscreen,
      // code view (</>), and import (download): redundant here. Undo/redo are
      // removed too - they render as a canvas overlay that didn't reliably take
      // clicks; we provide our own top-bar Undo/Redo wired to the UndoManager.
      ["preview", "fullscreen", "export-template", "gjs-open-import-webpage", "undo", "redo"].forEach((b) =>
        editor.Panels.removeButton("options", b),
      );
      // Light-gray editor-only borders on every block so empty divs/grids are
      // visible while building. Appended into the canvas iframe head (NOT the
      // CssComposer), so getCss()/the published /page/<slug> never include it.
      const doc = editor.Canvas.getDocument();
      if (doc) {
        const s = doc.createElement("style");
        s.textContent = `
          .gjs-dashed *[data-gjs-highlightable] {
            outline: 1px solid #e5e7eb !important;
            outline-offset: -1px;
          }
          /* Hide native selection overlay (we use .rsn-active); keep the native
             hover overlay (.gjs-highlighter) and color it blue. */
          .gjs-highlighter-sel { display: none !important; }
          .gjs-highlighter { outline: 2px solid #2680eb !important; outline-offset: -2px; }
          /* Single persistent red border on the selected element. Specificity
             (0,3,0) beats the gray block-outline rule above. */
          .gjs-dashed *[data-gjs-highlightable].rsn-active,
          .rsn-active.rsn-active {
            outline: 2px solid #2680eb !important;
            outline-offset: -2px;
          }
        `;
        doc.head.appendChild(s);
      }
      dedupeClassManager();
      const dock = styleDock();
      if (dock) clmObserver.observe(dock, { childList: true, subtree: true });

      // Watch the canvas tools layer; re-clamp the toolbar's left whenever its
      // inline style changes so it never hides under the dock (min 6px gutter).
      const toolsRoot = (editor.Canvas as unknown as { getToolsEl?: () => HTMLElement }).getToolsEl?.() ?? canvasRef.current;
      if (toolsRoot) {
        const clampToolbar = () => {
          const tb = toolsRoot.querySelector<HTMLElement>(".gjs-toolbar");
          if (tb && parseFloat(tb.style.left || "0") < 6) tb.style.left = "6px";
        };
        toolbarObserver = new MutationObserver(clampToolbar);
        toolbarObserver.observe(toolsRoot, { attributes: true, subtree: true, attributeFilter: ["style"] });
      }
    });

    // Jump to the Styles tab when a component is selected, and tag the selected
    // element's DOM node with `rsn-active` so the injected iframe CSS draws a
    // single red border on it. The class is on the DOM node only (not the
    // component model), so it never leaks into getHtml().
    let activeEl: HTMLElement | null = null;
    const setActive = (cmp?: { getEl?: () => HTMLElement | undefined } | null) => {
      if (activeEl) activeEl.classList.remove("rsn-active");
      activeEl = cmp?.getEl?.() ?? null;
      activeEl?.classList.add("rsn-active");
    };
    const bumpStyle = () => setStyleTick((t) => t + 1);
    editor.on("component:selected", (cmp) => {
      setRightTab("style");
      setActive(cmp as { getEl?: () => HTMLElement | undefined });
      bumpStyle();
    });
    editor.on("component:deselected", () => { setActive(null); bumpStyle(); });
    // Keep the top-bar Undo/Redo enabled state in sync with the history stack.
    editor.on("change:changesCount undo redo", () => setHistTick((t) => t + 1));
    // Re-read the custom Layout panel when styles change, classes change, or the
    // device switches (each can change the resolved value of display/flex props).
    editor.on("component:update:classes style:target component:styleUpdate change:device", bumpStyle);

    if (initialProject) {
      try {
        editor.loadProjectData(initialProject as Parameters<typeof editor.loadProjectData>[0]);
      } catch {
        /* corrupt/empty project - start blank */
      }
    } else if (html) {
      // No saved GrapesJS project yet, but the page was seeded with exported
      // HTML/CSS - import it so the page opens editable instead of blank.
      try {
        editor.setComponents(html);
        if (css) editor.addStyle(css);
      } catch {
        /* ignore malformed seed html */
      }
    }
    return () => {
      clmObserver.disconnect();
      toolbarObserver?.disconnect();
      editor.destroy();
      editorRef.current = null;
      // Clear the dock containers too - destroy() leaves the appendTo'd manager
      // DOM behind, which would duplicate on the next mount.
      docks.forEach((r) => { if (r.current) r.current.innerHTML = ""; });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchDevice(name: string) {
    editorRef.current?.setDevice(name);
    setDevice(name);
  }

  async function persist(publish: boolean) {
    const editor = editorRef.current;
    if (!editor) return;
    setSaving(true);
    setError(null);
    const body = {
      projectData: editor.getProjectData(),
      html: editor.getHtml(),
      css: editor.getCss(),
      ...(publish ? { publish: true } : {}),
    };
    const res = await fetch(`/api/page-builder/visual/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) setSavedAt(new Date().toLocaleTimeString());
    else setError((await res.json().catch(() => ({}))).error || "Save failed");
  }

  return (
    <div className="rsn-gjs" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 16px)" }}>
      <style>{GJS_THEME}</style>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
        <a href="/page-builder/visual" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13 }}>← Back</a>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{name}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>/page/{slug}</div>
        </div>

        {/* Custom device switcher (calls setDevice with our own device names) */}
        <div style={{ margin: "0 auto", display: "flex", gap: 2, background: "#f3f4f6", borderRadius: 8, padding: 3 }}>
          {DEVICES.map((d) => (
            <button
              key={d.name}
              title={d.name}
              onClick={() => switchDevice(d.name)}
              style={{
                fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                background: device === d.name ? "#fff" : "transparent",
                color: device === d.name ? "#FF2C2C" : "#6b7280",
                boxShadow: device === d.name ? "0 1px 2px rgba(0,0,0,.08)" : "none",
              }}
            >
              {d.name}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 2 }}>
            <HistoryBtn
              title="Undo"
              disabled={!(ed?.UndoManager as { hasUndo?: () => boolean } | undefined)?.hasUndo?.()}
              onClick={() => (ed?.UndoManager as { undo?: () => void } | undefined)?.undo?.()}
              path="M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8"
            />
            <HistoryBtn
              title="Redo"
              disabled={!(ed?.UndoManager as { hasRedo?: () => boolean } | undefined)?.hasRedo?.()}
              onClick={() => (ed?.UndoManager as { redo?: () => void } | undefined)?.redo?.()}
              path="M21 7v6h-6M21 13a9 9 0 1 1-3-7.7L21 8"
            />
          </div>
          {error && <span style={{ fontSize: 12, color: "#B91C1C" }}>{error}</span>}
          {savedAt && !error && <span style={{ fontSize: 12, color: "#6b7280" }}>Saved {savedAt}</span>}
          <a href={`${webUrl}/page/${slug}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 12px", textDecoration: "none" }}>Preview</a>
          <button onClick={() => persist(false)} disabled={saving} style={{ fontSize: 12, fontWeight: 600, color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 12px", background: "#fff", cursor: "pointer" }}>
            {saving ? "Saving…" : "Save Draft"}
          </button>
          <button onClick={() => persist(true)} disabled={saving} style={{ fontSize: 12, fontWeight: 600, color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", background: "#FF2C2C", cursor: "pointer" }}>
            Publish
          </button>
        </div>
      </div>

      {/* Body: left rail (Layers ⇄ Blocks, toggled in place by +/×) | canvas |
          right Styles/Properties dock. */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        {/* LEFT: Layers / Blocks (the + swaps them in place, becoming ×) */}
        <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "8px 10px 8px 12px", borderBottom: "1px solid #e5e7eb" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{showBlocks ? "Blocks" : "Layers"}</span>
            <button
              title={showBlocks ? "Close blocks" : "Add blocks"}
              onClick={() => setShowBlocks((v) => !v)}
              style={{
                marginLeft: "auto", width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 7, border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, fontWeight: 400,
                background: "#7c3aed", color: "#fff",
              }}
            >
              {showBlocks ? "×" : "+"}
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div ref={blocksRef} style={{ display: showBlocks ? "block" : "none" }} />
            <div ref={layersRef} style={{ display: showBlocks ? "none" : "block" }} />
          </div>
        </div>

        {/* CENTER: canvas */}
        <div ref={canvasRef} style={{ flex: 1, minWidth: 0 }} />

        {/* RIGHT: Styles / Properties */}
        <div style={{ width: 280, flexShrink: 0, borderLeft: "1px solid #e5e7eb", display: "flex", flexDirection: "column", background: "#fff" }}>
          <DockTabs
            tabs={[["style", "Styles"], ["settings", "Properties"]]}
            active={rightTab}
            onChange={(t) => setRightTab(t as "style" | "settings")}
          />
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ display: rightTab === "style" ? "block" : "none" }}>
              <div ref={selectorRef} style={{ padding: "10px 12px", borderBottom: "1px solid #f1f2f4" }} />
              <StylePanel editor={editorRef.current} tick={styleTick} />
              {/* Native GrapesJS style manager kept mounted but hidden - our
                  shadcn StylePanel above is the actual UI. */}
              <div ref={styleRef} style={{ display: "none" }} />
            </div>
            <div style={{ display: rightTab === "settings" ? "block" : "none" }}>
              {ed && <DynamicCardProps editor={ed} />}
              <div ref={traitRef} style={{ padding: "8px 0" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Custom shadcn "Layout" panel (replaces GrapesJS's native Layout sector) ──
type StyleModel = { getStyle: () => Record<string, string>; setStyle: (s: Record<string, string>) => void };

const DISPLAY_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: "block", label: "Block", desc: "Generates a block element box, with line breaks before and after the element in the normal flow." },
  { value: "inline", label: "Inline", desc: "Generates one or more inline boxes that don't break the line before or after." },
  { value: "inline-block", label: "Inline block", desc: "Flows with surrounding content like inline, but you can set width/height like a block." },
  { value: "flex", label: "Flex", desc: "Makes the element a flex container, laying out its direct children along an axis." },
  { value: "grid", label: "Grid", desc: "Makes the element a grid container for two-dimensional layouts." },
  { value: "none", label: "None", desc: "Removes the element from the layout - it is not rendered." },
];
const FLEX_DIRECTION = ["row", "row-reverse", "column", "column-reverse"];
const JUSTIFY = ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"];
const ALIGN = ["stretch", "flex-start", "center", "flex-end", "baseline"];
const FLEX_WRAP = ["nowrap", "wrap", "wrap-reverse"];

function getStyleModel(editor: Editor | null): StyleModel | null {
  if (!editor) return null;
  const cmp = editor.getSelected();
  if (!cmp) return null;
  try {
    // Respects the currently selected class/state/device, like the native SM.
    return (editor.StyleManager as unknown as { getModelToStyle: (c: unknown) => StyleModel }).getModelToStyle(cmp);
  } catch {
    return cmp as unknown as StyleModel;
  }
}

function readProp(editor: Editor | null, model: StyleModel | null, prop: string): string {
  const st = model?.getStyle?.() || {};
  if (st[prop]) return st[prop];
  const el = editor?.getSelected()?.getEl?.() as HTMLElement | undefined;
  if (el) {
    const win = el.ownerDocument.defaultView || window;
    const v = win.getComputedStyle(el).getPropertyValue(prop);
    if (v) return v.trim();
  }
  return "";
}

// Option lists for the select-type fields.
const POSITION = ["static", "relative", "absolute", "fixed", "sticky"];
const FLOAT = ["none", "left", "right"];
const FONT_WEIGHT = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];
const TEXT_ALIGN = ["left", "center", "right", "justify"];
const TEXT_TRANSFORM = ["none", "uppercase", "lowercase", "capitalize"];
const TEXT_DECORATION = ["none", "underline", "line-through", "overline"];
const BORDER_STYLE = ["none", "solid", "dashed", "dotted", "double"];
const CURSOR = ["auto", "default", "pointer", "text", "move", "grab", "not-allowed"];

type Getter = (prop: string) => string;
type Setter = (prop: string, val: string) => void;

// The whole right-side style editor: one custom shadcn panel per sector.
function StylePanel({ editor, tick }: { editor: Editor | null; tick: number }) {
  const [, force] = useState(0);
  void tick; // parent bumps it on selection/style/device change

  const model = getStyleModel(editor);
  if (!model) {
    return <div style={{ padding: 18, fontSize: 12.5, color: "#9ca3af", lineHeight: 1.6 }}>Select an element on the canvas to edit its styles.</div>;
  }
  const get: Getter = (prop) => readProp(editor, model, prop);
  const set: Setter = (prop, val) => {
    const cur = model.getStyle() || {};
    if (val === "") { const next = { ...cur }; delete next[prop]; model.setStyle(next); }
    else model.setStyle({ ...cur, [prop]: val });
    force((n) => n + 1);
  };

  const display = get("display") || "block";
  const isFlex = display === "flex" || display === "inline-flex";

  return (
    <>
      <SectionShell title="Layout" defaultOpen>
        <FieldRow label="Display" tip={DISPLAY_OPTIONS.find((o) => o.value === display)?.desc}>
          <Select value={display} onValueChange={(v) => set("display", v)}>
            <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{DISPLAY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </FieldRow>
        {isFlex && (
          <>
            <FieldRow label="Direction"><OptSelect value={get("flex-direction") || "row"} options={FLEX_DIRECTION} onChange={(v) => set("flex-direction", v)} /></FieldRow>
            <FieldRow label="Justify"><OptSelect value={get("justify-content") || "flex-start"} options={JUSTIFY} onChange={(v) => set("justify-content", v)} /></FieldRow>
            <FieldRow label="Align"><OptSelect value={get("align-items") || "stretch"} options={ALIGN} onChange={(v) => set("align-items", v)} /></FieldRow>
            <FieldRow label="Wrap"><OptSelect value={get("flex-wrap") || "nowrap"} options={FLEX_WRAP} onChange={(v) => set("flex-wrap", v)} /></FieldRow>
          </>
        )}
      </SectionShell>

      <SectionShell title="Size">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "12px 12px" }}>
          <MiniUnit label="Width" value={get("width")} onChange={(v) => set("width", v)} />
          <MiniUnit label="Height" value={get("height")} onChange={(v) => set("height", v)} />
          <MiniUnit label="Min Width" value={get("min-width")} onChange={(v) => set("min-width", v)} />
          <MiniUnit label="Min Height" value={get("min-height")} onChange={(v) => set("min-height", v)} />
          <MiniUnit label="Max Width" value={get("max-width")} onChange={(v) => set("max-width", v)} />
          <MiniUnit label="Max Height" value={get("max-height")} onChange={(v) => set("max-height", v)} />
        </div>
      </SectionShell>

      <SectionShell title="Space">
        <SpacingBox label="Padding" prefix="padding" get={get} set={set} />
        <SpacingBox label="Margin" prefix="margin" get={get} set={set} />
      </SectionShell>

      <SectionShell title="Position">
        <FieldRow label="Position"><OptSelect value={get("position") || "static"} options={POSITION} onChange={(v) => set("position", v)} /></FieldRow>
        <UnitField label="Top" value={get("top")} onChange={(v) => set("top", v)} />
        <UnitField label="Right" value={get("right")} onChange={(v) => set("right", v)} />
        <UnitField label="Bottom" value={get("bottom")} onChange={(v) => set("bottom", v)} />
        <UnitField label="Left" value={get("left")} onChange={(v) => set("left", v)} />
        <FieldRow label="Float"><OptSelect value={get("float") || "none"} options={FLOAT} onChange={(v) => set("float", v)} /></FieldRow>
        <NumberField label="Z-index" value={get("z-index")} onChange={(v) => set("z-index", v)} />
      </SectionShell>

      <SectionShell title="Typography">
        <TextField label="Font family" value={get("font-family")} onChange={(v) => set("font-family", v)} placeholder="inherit" />
        <UnitField label="Font size" value={get("font-size")} onChange={(v) => set("font-size", v)} />
        <FieldRow label="Weight"><OptSelect value={get("font-weight") || "400"} options={FONT_WEIGHT} onChange={(v) => set("font-weight", v)} /></FieldRow>
        <UnitField label="Letter spacing" value={get("letter-spacing")} onChange={(v) => set("letter-spacing", v)} />
        <TextField label="Line height" value={get("line-height")} onChange={(v) => set("line-height", v)} placeholder="1.5" />
        <ColorField label="Color" value={get("color")} onChange={(v) => set("color", v)} />
        <FieldRow label="Align"><OptSelect value={get("text-align") || "left"} options={TEXT_ALIGN} onChange={(v) => set("text-align", v)} /></FieldRow>
        <FieldRow label="Transform"><OptSelect value={get("text-transform") || "none"} options={TEXT_TRANSFORM} onChange={(v) => set("text-transform", v)} /></FieldRow>
        <FieldRow label="Decoration"><OptSelect value={get("text-decoration") || "none"} options={TEXT_DECORATION} onChange={(v) => set("text-decoration", v)} /></FieldRow>
      </SectionShell>

      <SectionShell title="Background">
        <ColorField label="Background" value={get("background-color")} onChange={(v) => set("background-color", v)} />
        <TextField label="Image / gradient" value={get("background-image")} onChange={(v) => set("background-image", v)} placeholder="url(...)" />
      </SectionShell>

      <SectionShell title="Borders">
        <UnitField label="Radius" value={get("border-radius")} onChange={(v) => set("border-radius", v)} />
        <UnitField label="Width" value={get("border-width")} onChange={(v) => set("border-width", v)} />
        <FieldRow label="Style"><OptSelect value={get("border-style") || "none"} options={BORDER_STYLE} onChange={(v) => set("border-style", v)} /></FieldRow>
        <ColorField label="Color" value={get("border-color")} onChange={(v) => set("border-color", v)} />
      </SectionShell>

      <SectionShell title="Effects">
        <NumberField label="Opacity" value={get("opacity")} onChange={(v) => set("opacity", v)} step={0.1} min={0} max={1} />
        <TextField label="Box shadow" value={get("box-shadow")} onChange={(v) => set("box-shadow", v)} placeholder="0 2px 8px rgba(0,0,0,.1)" />
        <TextField label="Transition" value={get("transition")} onChange={(v) => set("transition", v)} placeholder="all .2s ease" />
        <TextField label="Transform" value={get("transform")} onChange={(v) => set("transform", v)} placeholder="rotate(5deg)" />
        <FieldRow label="Cursor"><OptSelect value={get("cursor") || "auto"} options={CURSOR} onChange={(v) => set("cursor", v)} /></FieldRow>
      </SectionShell>
    </>
  );
}

function SectionShell({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid #f1f2f4" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "#fff", border: "none", cursor: "pointer", padding: "11px 12px", font: "600 12px system-ui,sans-serif", color: "#111827" }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: "#9ca3af" }}><path d="M9 18l6-6-6-6" /></svg>
        {title}
      </button>
      {open && <div style={{ padding: "10px 12px 14px" }}>{children}</div>}
    </div>
  );
}

const UNITS = ["px", "%", "em", "rem", "vh", "vw", "auto"];

// Single combined value+unit control: borderless number + inline unit picker
// inside one bordered box (type the number, change the unit from the dropdown).
function UnitInput({ value, onChange, full }: { value: string; onChange: (v: string) => void; full?: boolean }) {
  const raw = (value || "").trim();
  const isAuto = raw === "auto";
  const m = /^(-?[\d.]+)(px|%|em|rem|vh|vw)?$/.exec(raw);
  const num = m ? m[1] : "";
  const unit = (m && m[2]) || "px";
  return (
    <div style={{ display: "flex", alignItems: "center", border: "1px solid #d1d5db", borderRadius: 6, height: 32, background: "#fff", width: full ? "100%" : 140, boxSizing: "border-box", overflow: "hidden" }}>
      <input
        type="number" disabled={isAuto}
        value={isAuto ? "" : num} placeholder={isAuto ? "auto" : "0"}
        onChange={(e) => onChange(e.target.value === "" ? "" : `${e.target.value}${unit === "auto" ? "px" : unit}`)}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 12, color: "#111827", padding: "0 8px" }}
      />
      <Select
        value={isAuto ? "auto" : unit}
        onValueChange={(v) => (v === "auto" ? onChange("auto") : onChange(`${num || 0}${v}`))}
      >
        <SelectTrigger className="h-full w-auto min-w-0 shrink-0 gap-1 rounded-none border-0 border-l border-[#eef0f2] bg-transparent px-2 text-[11px] text-[#6b7280] focus:ring-0 focus:ring-offset-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="min-w-[4rem]">
          {UNITS.map((u) => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function UnitField({ label, tip, value, onChange }: { label: string; tip?: string; value: string; onChange: (v: string) => void }) {
  return (
    <FieldRow label={label} tip={tip}>
      <UnitInput value={value} onChange={onChange} />
    </FieldRow>
  );
}

function NumberField({ label, tip, value, onChange, step, min, max }: { label: string; tip?: string; value: string; onChange: (v: string) => void; step?: number; min?: number; max?: number }) {
  return (
    <FieldRow label={label} tip={tip}>
      <Input className="h-8 text-xs w-[140px]" type="number" step={step} min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </FieldRow>
  );
}

function TextField({ label, tip, value, onChange, placeholder }: { label: string; tip?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <FieldRow label={label} tip={tip}>
      <Input className="h-8 text-xs w-[140px]" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </FieldRow>
  );
}

function ColorField({ label, tip, value, onChange }: { label: string; tip?: string; value: string; onChange: (v: string) => void }) {
  const hex = /^#([0-9a-f]{3,8})$/i.test((value || "").trim()) ? value : "#000000";
  return (
    <FieldRow label={label} tip={tip}>
      <div style={{ display: "flex", gap: 4, width: 140, alignItems: "center" }}>
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} style={{ width: 32, height: 32, padding: 2, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", flexShrink: 0 }} />
        <Input className="h-8 text-xs flex-1" value={value} placeholder="-" onChange={(e) => onChange(e.target.value)} />
      </div>
    </FieldRow>
  );
}

// Compact value+unit field with a label above (used in the Size grid + spacing).
function MiniUnit({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <UnitInput value={value} onChange={onChange} full />
    </div>
  );
}

// Padding / Margin editor: "All" mode (one value → all four sides) or per-side
// cross layout (Top / Left·Right / Bottom), Studio-style.
function SpacingBox({ label, prefix, get, set }: { label: string; prefix: "margin" | "padding"; get: Getter; set: Setter }) {
  const sides = ["top", "right", "bottom", "left"] as const;
  const vals = sides.map((s) => get(`${prefix}-${s}`));
  const allEqual = vals.every((v) => v === vals[0]);
  const [mode, setMode] = useState<"all" | "custom">(allEqual ? "all" : "custom");
  const setAll = (v: string) => sides.forEach((s) => set(`${prefix}-${s}`, v));

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>{label}</span>
        <div style={{ display: "flex", gap: 2, background: "#f3f4f6", borderRadius: 6, padding: 2 }}>
          <ToggleBtn active={mode === "all"} onClick={() => setMode("all")} title="All sides">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
          </ToggleBtn>
          <ToggleBtn active={mode === "custom"} onClick={() => setMode("custom")} title="Per side">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3" /></svg>
          </ToggleBtn>
        </div>
      </div>
      {mode === "all" ? (
        <MiniUnit label="All sides" value={get(`${prefix}-top`)} onChange={setAll} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "8px 10px" }}>
          <div style={{ gridColumn: "1 / -1" }}><MiniUnit label="Top" value={get(`${prefix}-top`)} onChange={(v) => set(`${prefix}-top`, v)} /></div>
          <MiniUnit label="Left" value={get(`${prefix}-left`)} onChange={(v) => set(`${prefix}-left`, v)} />
          <MiniUnit label="Right" value={get(`${prefix}-right`)} onChange={(v) => set(`${prefix}-right`, v)} />
          <div style={{ gridColumn: "1 / -1" }}><MiniUnit label="Bottom" value={get(`${prefix}-bottom`)} onChange={(v) => set(`${prefix}-bottom`, v)} /></div>
        </div>
      )}
    </div>
  );
}

function ToggleBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: ReactNode }) {
  return (
    <button title={title} onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 24, borderRadius: 5, border: "none", cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? "#FF2C2C" : "#6b7280", boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none" }}>
      {children}
    </button>
  );
}

function FieldRow({ label, tip, children }: { label: string; tip?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#374151", fontWeight: 500 }}>
        {label}
        {tip && (
          <WithTooltip text={tip}>
            <span style={{ display: "inline-flex", cursor: "help", color: "#9ca3af" }} aria-label="Info">
              <Info size={13} strokeWidth={2} />
            </span>
          </WithTooltip>
        )}
      </span>
      {children}
    </div>
  );
}

function OptSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HistoryBtn({ title, path, disabled, onClick }: { title: string; path: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff",
        color: disabled ? "#d1d5db" : "#374151", cursor: disabled ? "default" : "pointer",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
    </button>
  );
}

function DockTabs({ tabs, active, onChange }: { tabs: [string, string][]; active: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
      {tabs.map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: "transparent",
            color: active === key ? "#FF2C2C" : "#6b7280",
            borderBottom: active === key ? "2px solid #FF2C2C" : "2px solid transparent",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
