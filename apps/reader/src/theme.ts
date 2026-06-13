// Shared design tokens for the reader app. Brand red matches the website +
// reporter app (#FF2C2C). Kept flat + plain so any screen can import it.

export const colors = {
  brand: "#FF2C2C",
  brandDark: "#D81E1E",
  bg: "#FFFFFF",
  bgMuted: "#F4F4F5",
  card: "#FFFFFF",
  text: "#18181B",
  textMuted: "#71717A",
  textFaint: "#A1A1AA",
  border: "#E4E4E7",
  // Full-screen swipe reader is dark, way2news-style.
  readerBg: "#0B0B0C",
  readerText: "#FFFFFF",
  readerMuted: "#C4C4C8",
  overlay: "rgba(0,0,0,0.45)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

// Convert a #RGB / #RRGGBB hex string into an rgba() with the given alpha.
// Used to derive a soft tinted background from a category's own accent colour.
// Falls back to the brand red if the input isn't a parseable hex.
export function withAlpha(hex: string | null | undefined, alpha: number): string {
  let h = (hex || colors.brand).replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return `rgba(255,44,44,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
