"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export function ReturnVisitBanner() {
  const [message, setMessage] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    // In the page-builder editor preview this banner would render NOTHING -
    // it only appears to a RETURNING visitor (one who last visited on an
    // earlier day), so there's no state to trigger it in the editor. Show a
    // clearly-labelled sample so the operator can see + position the block.
    // Production pages never hit this path (URL isn't /page-builder/preview),
    // so live behaviour is unchanged: real returning-visitor logic below.
    if (
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/page-builder/preview")
    ) {
      setMessage("👋 తిరిగి వచ్చిన పాఠకులకు చూపే బ్యానర్ (ఎడిటర్ నమూనా)");
      setShow(true);
      return;
    }

    const lastVisit = localStorage.getItem("last-visit-date");
    const today = new Date().toDateString();

    if (lastVisit && lastVisit !== today) {
      const lastDate = new Date(lastVisit);
      const diff = Math.floor((Date.now() - lastDate.getTime()) / 86400000);

      if (diff === 1) {
        // Consecutive day
        const streak = parseInt(localStorage.getItem("visit-streak") || "1") + 1;
        localStorage.setItem("visit-streak", String(streak));
        setMessage(`${streak} రోజులు వరుసగా చదువుతున్నారు! నేటి ముఖ్యమైన వార్తలు చూడండి`);
        setShow(true);
      } else if (diff <= 3) {
        setMessage("మీరు తిరిగి వచ్చారు! నేటి తాజా వార్తలు చూడండి");
        setShow(true);
        localStorage.setItem("visit-streak", "1");
      } else {
        // Gap > 3 days
        setMessage(`${diff} రోజుల తర్వాత తిరిగి వచ్చారు - మీరు miss అయిన వార్తలు చూడండి`);
        setShow(true);
        localStorage.setItem("visit-streak", "1");
      }
    }

    localStorage.setItem("last-visit-date", today);

    // Auto-dismiss after 10 seconds
    const timer = setTimeout(() => setShow(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div style={{
      background: "linear-gradient(90deg, #fff7ed, #fffbeb)",
      borderBottom: "1px solid #fed7aa",
      padding: "8px 16px",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
    }}>
      <span style={{ fontSize: 16 }}>👋</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>{message}</span>
      <Link href="/" style={{
        fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--color-brand)",
        padding: "4px 12px", borderRadius: 4, textDecoration: "none",
      }}>
        చదవండి
      </Link>
      <button onClick={() => setShow(false)} style={{
        background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 14, marginLeft: 4,
      }}>✕</button>
    </div>
  );
}
