// Page Builder (Spec #2) — public iframe preview route for the admin
// editor. apps/admin loads this URL inside the canvas iframe with
// ?draft=1 so the operator sees the in-progress draftLayout (falling
// back to the published layout when no draft exists). The page emits
// `data-block-id` attributes on each rendered block so the editor can
// draw insertion lines + selection outlines via postMessage.
//
// Polish in H1 (#171): hide the global chrome (DistrictPicker / WhatsApp
// float / cookie banner) when this page renders inside the editor frame.

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

  // Default URL context = "/" — the editor can override (E5+) via the
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
      {/* Block-selection postMessage hook used by the editor (E3 #165) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener('click', (e) => {
              const el = e.target.closest('[data-block-id]');
              if (!el) return;
              e.preventDefault();
              window.parent?.postMessage(
                { type: 'page-builder:select', blockId: el.dataset.blockId },
                '*'
              );
            }, true);
            window.parent?.postMessage({ type: 'page-builder:ready' }, '*');
          `,
        }}
      />
      <style>{`
        /* Editor preview should not show site-wide chrome (cookie banner,
           district picker, WhatsApp float, push permission). */
        body :is(.district-picker-root, .cookie-consent-root, .whatsapp-float-root, .push-notif-root) {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
