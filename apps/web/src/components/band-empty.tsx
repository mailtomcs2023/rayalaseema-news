// Shared empty-state for the home-page filter bands (CinemaBand / SectionBand).
// Shown when a tab's category has no published articles yet - a polished
// placeholder (soft icon + heading + sub-line) instead of bare text.

export function BandEmpty({
  title = "వార్తలు త్వరలో",
  subtitle = "ఈ విభాగంలో కొత్త కథనాలు త్వరలో అందుబాటులోకి వస్తాయి.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "40px 16px 44px",
        minHeight: 220,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 66,
          height: 66,
          borderRadius: "50%",
          background: "var(--brand-soft, #FFF1F1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--brand, #E01B1B)"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* newspaper / document glyph */}
          <path d="M4 5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v13a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5Z" />
          <path d="M17 7h2a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2" />
          <line x1="7.5" y1="8" x2="13.5" y2="8" />
          <line x1="7.5" y1="11.5" x2="13.5" y2="11.5" />
          <line x1="7.5" y1="15" x2="11" y2="15" />
        </svg>
      </div>
      <div
        style={{
          fontFamily: "var(--font-telugu-heading), sans-serif",
          fontSize: 16.5,
          fontWeight: 800,
          color: "var(--n-800, #1f2937)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: "var(--font-telugu-body), sans-serif",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--n-500, #6b7280)",
          maxWidth: 300,
          lineHeight: 1.7,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}
