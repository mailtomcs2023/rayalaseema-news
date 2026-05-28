// Single source of truth for the role hierarchy and what each role gets to
// see in the admin portal. The four roles match the Postgres `Role` enum:
//
//   ADMIN       - full access (HR, payments, settings, every editorial action)
//   EDITOR      - Sub Editor + Approve / Publish + breaking news + ePaper
//   SUB_EDITOR  - Pick up review, Reject; cannot Approve / Publish
//   REPORTER    - Write own articles, view earnings, edit profile (sandboxed)
//
// `roles` arrays on each sidebar item declare visibility. API-side
// `requireAuth([...])` checks remain the authoritative server-side gate;
// the sidebar filtering is just so a reporter doesn't see fourteen admin
// items that would 403 if clicked.

export type Role = "ADMIN" | "EDITOR" | "SUB_EDITOR" | "REPORTER";

// Where each role lands after login. Called from the login page and the
// `/` root page (which redirects reporters away from the editorial dashboard).
export function landingFor(role: Role | string | undefined): string {
  switch (role) {
    case "REPORTER":
      return "/reporter";
    case "SUB_EDITOR":
      return "/review";
    case "EDITOR":
    case "ADMIN":
    default:
      return "/";
  }
}

// Coarse-grained "can this role hit this top-level area?" check used by
// the root-page redirect. Doesn't replace API-level requireAuth - that
// stays the source of truth for what mutations a role can perform.
export function canVisit(role: Role | string | undefined, pathname: string): boolean {
  if (role === "ADMIN") return true;
  if (role === "REPORTER") {
    // Reporter web portal mirrors the Expo app - everything lives under
    // /reporter (home), /reporter/articles, /reporter/earnings, /reporter/profile.
    // Anything else bounces to /reporter.
    if (pathname === "/login" || pathname.startsWith("/api/")) return true;
    return pathname === "/reporter" || pathname.startsWith("/reporter/");
  }
  // SUB_EDITOR + EDITOR: blocked from the HR/finance/settings cluster.
  const adminOnly = [
    "/users",
    "/reporters",
    "/payments",
    "/settings",
    "/categories",
    "/desks",
    "/ads",
    "/epaper-templates",
  ];
  if (role === "SUB_EDITOR") {
    // Sub editor: no big content surfaces either (breaking news, videos, etc.)
    const editorOnly = [
      "/breaking-news",
      "/videos",
      "/gallery",
      "/stories",
      "/reels",
      "/cartoons",
      "/news-feed",
      "/mandi",
      "/polls",
      "/comments",
      "/epaper",
      "/profile-requests",
      "/audit-log",
      "/page-builder",
    ];
    if (adminOnly.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
    if (editorOnly.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
    return true;
  }
  // EDITOR: only blocked from the admin-only cluster.
  return !adminOnly.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
