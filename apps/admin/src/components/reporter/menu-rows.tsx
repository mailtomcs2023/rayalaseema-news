import Link from "next/link";

// Shared settings-style menu row primitives for the reporter profile page
// (and anywhere else on the reporter web portal that needs the same
// grouped-list look, e.g. the press-card tile). Extracted from
// reporter/profile/page.tsx - bodies unchanged.

export function MenuGroup({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        marginBottom: 14,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      }}
    >
      {children}
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: "#eef0f3", marginLeft: 54 }} />;
}

export function MenuRow({
  href,
  id,
  iconBg,
  iconColor,
  iconPath,
  label,
  sub,
  badge,
  locked,
  last,
}: {
  href?: string;
  id?: string;
  iconBg: string;
  iconColor: string;
  iconPath: string;
  label: string;
  sub?: string;
  badge?: string;
  locked?: boolean;
  last?: boolean;
}) {
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    minHeight: 56,
    // Pad the scroll target so deep-link anchor jumps don't hide the
    // row under the sticky red header.
    scrollMarginTop: 80,
    color: "inherit",
    textDecoration: "none",
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    href ? (
      <Link href={href} id={id} style={rowStyle}>
        {children}
      </Link>
    ) : (
      <div id={id} style={rowStyle}>
        {children}
      </div>
    );

  return (
    <Wrapper>
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: iconBg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={iconPath} />
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#111" }}>{label}</p>
        {sub ? (
          <p
            style={{
              fontSize: 12,
              color: "#999",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {sub}
          </p>
        ) : null}
      </div>
      {badge ? (
        <span
          style={{
            minWidth: 22,
            height: 22,
            padding: "0 6px",
            borderRadius: 11,
            background: "#FF2C2C",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {badge}
        </span>
      ) : null}
      {locked ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c4c4c4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
      {/* `last` prop kept for API symmetry with the Expo MenuRow but unused
          here - dividers are sibling elements instead of an inset border. */}
      {void last}
    </Wrapper>
  );
}
