"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Minimal share row for the breaking-news detail page: three small outlined
// icon buttons (native Share / WhatsApp / Copy link). Deliberately lighter than
// the full ShareBar used on articles.
export function BreakingShare({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const waText = `${title}\n\n${url}`;

  const onShare = async () => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, text: title, url });
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, "_blank", "noopener,noreferrer");
    } catch {
      /* user cancelled - silent */
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - silent */
    }
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={onShare}
        aria-label="Share"
        className="rounded-full text-slate-500 hover:border-red-500 hover:text-red-600"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </Button>

      <Button
        asChild
        variant="outline"
        size="icon-sm"
        aria-label="WhatsApp"
        className="rounded-full text-slate-500 hover:border-red-500 hover:text-red-600"
      >
        <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 32 32" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M16 .395a15.6 15.6 0 0 0-13.4 23.604L0 32l8.2-2.5A15.6 15.6 0 1 0 16 .395Zm0 28.4a12.9 12.9 0 0 1-6.6-1.8l-.5-.3-4.9 1.5 1.6-4.8-.3-.5a12.9 12.9 0 1 1 10.7 5.9Zm7.4-9.7c-.4-.2-2.4-1.2-2.7-1.3s-.6-.2-.9.2-1 1.3-1.3 1.5-.5.3-.9.1c-2.4-1.2-4-2.2-5.6-5-.4-.7.4-.6 1.1-2.1.1-.3 0-.5-.1-.7s-.9-2.1-1.2-2.9-.6-.7-.9-.7h-.7c-.3 0-.7.1-1.1.5s-1.4 1.4-1.4 3.4 1.5 4 1.7 4.3 2.9 4.5 7.1 6.3a23.3 23.3 0 0 0 2.3.9c1 .3 1.9.3 2.6.2.8-.1 2.4-1 2.7-1.9.3-.9.3-1.7.2-1.9-.1-.1-.4-.2-.8-.4Z" /></svg>
        </a>
      </Button>

      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={onCopy}
        aria-label={copied ? "Copied" : "Copy link"}
        className="rounded-full text-slate-500 hover:border-red-500 hover:text-red-600"
      >
        {copied ? (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
      </Button>
    </div>
  );
}
