"use client";

// Small client island that renders the user's 6-digit login code with a
// copy-to-clipboard button. Pure presentation - the code itself is passed
// in from the parent server component. Kept its own component so the
// profile page can stay a server component (no need to "use client" the
// whole page for one button).

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function UserCodeChip({ code, raw }: { code: string; raw: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      // Copy the unspaced form so it pastes cleanly into a numeric input.
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      toast.success("Code copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title="Copy code"
      aria-label="Copy login code"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        marginTop: 10,
        borderRadius: 999,
        background: "#f3f4f6",
        border: "1px solid #e5e7eb",
        cursor: "pointer",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: 1,
        color: "#111",
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: "#888", letterSpacing: 1.2, textTransform: "uppercase" }}>
        Code
      </span>
      <span>{code}</span>
      {copied ? (
        <Check size={14} style={{ color: "#16a34a" }} />
      ) : (
        <Copy size={14} style={{ color: "#888" }} />
      )}
    </button>
  );
}
