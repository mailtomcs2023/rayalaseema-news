"use client";

import { useEffect, useState } from "react";

// Paywall modal (#93). Mounted on article pages; on first render the article
// slug is sent to /api/paywall/check. If the API returns allowed=false the
// article body is overlaid + the subscribe modal renders.
//
// Soft-fail: any error → allow read. Never trade a backend hiccup for a
// frustrated reader leaving the page.
export function PaywallModal({ articleSlug }: { articleSlug: string }) {
  const [state, setState] = useState<"checking" | "allowed" | "blocked">("checking");
  const [count, setCount] = useState(0);
  const [limit, setLimit] = useState(5);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/paywall/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleSlug }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.allowed === false) setState("blocked");
        else setState("allowed");
        if (typeof data?.count === "number") setCount(data.count);
        if (typeof data?.limit === "number") setLimit(data.limit);
      })
      .catch(() => !cancelled && setState("allowed"));
    return () => { cancelled = true; };
  }, [articleSlug]);

  // Apply the visual block by toggling a class on <body> when blocked. Lets
  // the article markup stay simple; the actual content-cap CSS lives in
  // globals.css (article-paywall-blocked { … }).
  useEffect(() => {
    if (state === "blocked") document.body.classList.add("article-paywall-blocked");
    return () => document.body.classList.remove("article-paywall-blocked");
  }, [state]);

  if (state !== "blocked") return null;

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", padding: 16 }}>
      <div style={{ background: "#fff", maxWidth: 480, width: "100%", borderRadius: 12, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h2 style={{ fontFamily: "var(--font-telugu-heading), serif", fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 8 }}>
          మీరు {limit} ఉచిత కథనాలను చదివారు
        </h2>
        <p style={{ fontFamily: "var(--font-telugu-body), sans-serif", fontSize: 14, color: "#4b5563", lineHeight: 1.6, marginBottom: 16 }}>
          రాయలసీమ న్యూస్‌లో మరిన్ని కథనాలు చదవడానికి సభ్యత్వం పొందండి.
          నెలకు కేవలం ₹49 — అపరిమిత యాక్సెస్, ఈ-పేపర్ డౌన్‌లోడ్, ప్రకటనలు లేని అనుభవం.
        </p>
        <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
          <a href="/subscribe"
            style={{ display: "block", background: "var(--brand, #E01B1B)", color: "#fff", padding: "12px 18px", borderRadius: 8, textAlign: "center", textDecoration: "none", fontWeight: 800, fontSize: 14 }}>
            సభ్యత్వం పొందండి
          </a>
          <a href="/login"
            style={{ display: "block", background: "transparent", color: "#374151", padding: "10px 18px", borderRadius: 8, textAlign: "center", textDecoration: "none", fontWeight: 700, fontSize: 13, border: "1px solid #d1d5db" }}>
            ఇప్పటికే సభ్యులా? లాగిన్ చేయండి
          </a>
        </div>
        <p style={{ marginTop: 14, fontSize: 11, color: "#6b7280", textAlign: "center" }}>
          ఈ నెలలో {count} / {limit} ఉచిత కథనాలను చదివారు
        </p>
      </div>
    </div>
  );
}
