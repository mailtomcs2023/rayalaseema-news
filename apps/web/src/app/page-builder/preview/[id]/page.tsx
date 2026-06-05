// Page Builder (Spec #2) - public iframe preview route for the admin
// editor. apps/admin loads this URL inside the canvas iframe with
// ?draft=1 so the operator sees the in-progress draftLayout (falling
// back to the published layout when no draft exists). The page emits
// `data-block-id` attributes on each rendered block so the editor can
// draw insertion lines + selection outlines via postMessage.
//
// Polish in H1 (#171): hide the global chrome (WhatsApp float / cookie
// banner) when this page renders inside the editor frame.

import { prisma } from "@rayalaseema/db";
import { TemplateRenderer } from "@/components/blocks/template-renderer";
import { Suspense } from "react";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string; url?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const draft = sp.draft === "1" || sp.draft === "true";

  const tpl = await prisma.template.findUnique({
    where: { id },
    select: { id: true, name: true, layout: true, draftLayout: true },
  });
  if (!tpl) return notFound();

  // Default URL context = "/" - the editor can override (E5+) via the
  // ?url= query so the operator can preview a category template against
  // a real category slug.
  const urlPath = sp.url || "/";

  return (
    <div data-pb-preview style={{ maxWidth: 1280, margin: "0 auto", padding: "8px" }}>
      <Suspense fallback={<div style={{ padding: 40, color: "#9ca3af" }}>Loading preview…</div>}>
        <TemplateRenderer
          urlPath={urlPath}
          templateOverride={{ layout: tpl.layout, draftLayout: tpl.draftLayout }}
          draft={draft}
        />
      </Suspense>
      {/* Editor ↔ preview postMessage bridge (E3 #165).
          - up:    page-builder:ready / page-builder:select / page-builder:blocks
          - down:  page-builder:highlight / page-builder:scroll-to */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var HL_ID = '__pb_highlight__';
              function clearHl() {
                document.querySelectorAll('[data-block-id]').forEach(function (el) {
                  el.style.outline = '';
                  el.style.outlineOffset = '';
                });
              }
              function highlight(id) {
                clearHl();
                if (!id) return;
                var el = document.querySelector('[data-block-id="' + id + '"]');
                if (!el) return;
                el.style.outline = '2px solid #FF2C2C';
                el.style.outlineOffset = '2px';
              }
              function reportBlocks() {
                var ids = Array.prototype.map.call(
                  document.querySelectorAll('[data-block-id]'),
                  function (el) { return el.getAttribute('data-block-id'); }
                );
                window.parent && window.parent.postMessage(
                  { type: 'page-builder:blocks', ids: ids },
                  '*'
                );
              }

              document.addEventListener('click', function (e) {
                var t = e.target;
                while (t && t !== document.body && !t.getAttribute('data-block-id')) {
                  t = t.parentElement;
                }
                if (!t || !t.getAttribute) return;
                var id = t.getAttribute('data-block-id');
                if (!id) return;
                e.preventDefault();
                e.stopPropagation();
                window.parent && window.parent.postMessage(
                  { type: 'page-builder:select', blockId: id },
                  '*'
                );
                highlight(id);
              }, true);

              window.addEventListener('message', function (ev) {
                var d = ev.data || {};
                if (d.type === 'page-builder:highlight') highlight(d.blockId);
                if (d.type === 'page-builder:scroll-to' && d.blockId) {
                  var el = document.querySelector('[data-block-id="' + d.blockId + '"]');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  highlight(d.blockId);
                }
              });

              window.parent && window.parent.postMessage({ type: 'page-builder:ready' }, '*');
              reportBlocks();
            })();
          `,
        }}
      />
      <style>{`
        /* Editor preview should not show site-wide chrome (cookie banner,
           WhatsApp float, push permission). */
        body :is(.cookie-consent-root, .whatsapp-float-root, .push-notif-root) {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
