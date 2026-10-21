"use client";

export function ScorePill({ value, label }: { value: number | null | undefined; label: string }) {
  const v = typeof value === "number" ? Math.round(value) : null;
  const tone = v == null ? { bg: "#e5e7eb", fg: "#374151" } : v >= 80 ? { bg: "#dcfce7", fg: "#166534" } : v >= 60 ? { bg: "#fef3c7", fg: "#92400e" } : { bg: "#fee2e2", fg: "#991b1b" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 10px", borderRadius: 999, background: tone.bg, color: tone.fg, fontSize: 12, fontWeight: 600 }}>
      <span style={{ opacity: 0.75 }}>{label}</span>
      <span>{v == null ? "–" : v}</span>
    </span>
  );
}
