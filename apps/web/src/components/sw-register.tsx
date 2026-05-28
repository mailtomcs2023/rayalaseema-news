"use client";

import { useEffect, useState } from "react";

// Registers /sw.js once on first client paint. Also tracks the beforeinstallprompt
// event so the /epaper page can offer an Install button. #92 PWA.
export function SWRegister() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Defer registration until idle so it doesn't compete with first paint.
    const reg = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(reg, { timeout: 4000 });
    } else {
      setTimeout(reg, 2000);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => { setInstalled(true); setDeferredPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Expose install via a small button only on /epaper; surfaces only when the
  // browser has actually fired beforeinstallprompt (Chrome/Edge - Safari uses
  // its own Add-to-Home-Screen affordance).
  if (installed || !deferredPrompt) return null;
  if (typeof window !== "undefined" && !/^\/epaper(\/|$)/.test(window.location.pathname)) return null;

  return (
    <button
      onClick={async () => {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === "accepted") setDeferredPrompt(null);
      }}
      style={{
        position: "fixed", bottom: 18, right: 18, zIndex: 80,
        background: "var(--brand, #E01B1B)", color: "#fff",
        padding: "10px 18px", borderRadius: 999, border: "none",
        fontSize: 13, fontWeight: 800, cursor: "pointer",
        boxShadow: "0 6px 24px rgba(0,0,0,0.16)",
        fontFamily: "var(--font-telugu-body), sans-serif",
      }}
      title="Install Rayalaseema Express ePaper to your home screen for offline access"
    >
      📲 ఈ-పేపర్ యాప్‌గా జోడించండి
    </button>
  );
}
