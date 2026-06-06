"use client";

// Bundle of non-critical floating UI + observers that sit in the root
// layout. None of them need to render before LCP:
//   - WhatsAppFloat: fixed-position icon, user clicks it after scroll
//   - WebVitalsReporter: fires on page-load callbacks
//   - PushNotifications: only matters once the user opts in
//   - SWRegister: registers /sw.js (already self-defers via
//     requestIdleCallback inside the component)
//
// Wrapping them in a client component that mounts them inside a
// requestIdleCallback effect cuts ~30-50 KiB of script-evaluation off
// the LCP critical path. Each component is dynamic-imported with
// ssr:false so the modules themselves aren't pulled into the initial
// bundle either (Next code-splits them on demand).

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const WhatsAppFloat = dynamic(() => import("./whatsapp-float").then((m) => m.WhatsAppFloat), { ssr: false });
const WebVitalsReporter = dynamic(() => import("./web-vitals-reporter").then((m) => m.WebVitalsReporter), { ssr: false });
const PushNotifications = dynamic(() => import("./push-notifications").then((m) => m.PushNotifications), { ssr: false });
const SWRegister = dynamic(() => import("./sw-register").then((m) => m.SWRegister), { ssr: false });

export function DeferredFooterClients() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const cb = () => setMounted(true);
    const win = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(cb, { timeout: 3000 });
      return () => win.cancelIdleCallback?.(id);
    }
    const t = setTimeout(cb, 1500);
    return () => clearTimeout(t);
  }, []);

  if (!mounted) return null;
  return (
    <>
      <WhatsAppFloat />
      <WebVitalsReporter />
      <PushNotifications />
      <SWRegister />
    </>
  );
}
