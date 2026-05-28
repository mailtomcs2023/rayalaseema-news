// Page Builder (Spec #2) - URL pattern matcher + assignment resolver.
// Spec: docs/superpowers/specs/2026-05-25-page-builder-design.md §"Pattern matcher"
//
// Pattern grammar:
//   "/"                       → root only
//   "/category/movie-reviews" → exact match
//   "/category/*"             → single-segment glob (no "/")
//   "/category/**"            → multi-segment glob (matches across "/")
//
// Resolution order:
//   1. priority DESC (higher wins)
//   2. pattern length DESC (more specific wins on tie)
//   3. (last resort) pattern.localeCompare for deterministic ordering

const ESCAPE_RE = /[.+?^${}()|[\]\\]/g;

function escapeRegex(s: string): string {
  return s.replace(ESCAPE_RE, "\\$&");
}

/**
 * Convert a page-builder URL pattern to a RegExp.
 * `**` must come before `*` so the two-star token gets a wider match group.
 */
export function patternToRegex(pattern: string): RegExp {
  // Tokenize on `**` and `*` so we can escape literal segments without
  // double-escaping the wildcards themselves.
  const parts: string[] = [];
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === "*" && pattern[i + 1] === "*") {
      parts.push(".*"); // any chars, including "/"
      i += 2;
    } else if (pattern[i] === "*") {
      parts.push("[^/]*"); // any chars except "/"
      i += 1;
    } else {
      // Grab a literal run up to the next "*"
      let j = i;
      while (j < pattern.length && pattern[j] !== "*") j++;
      parts.push(escapeRegex(pattern.slice(i, j)));
      i = j;
    }
  }
  return new RegExp(`^${parts.join("")}$`);
}

export function matchPattern(pattern: string, urlPath: string): boolean {
  // Normalize trailing slash (but keep root "/").
  const path =
    urlPath.length > 1 && urlPath.endsWith("/") ? urlPath.slice(0, -1) : urlPath;
  return patternToRegex(pattern).test(path);
}

export interface AssignmentLike {
  pattern: string;
  priority: number;
  active: boolean;
  template: { isPublished: boolean } | null | undefined;
}

/**
 * Sort comparator: highest priority first, then longest pattern, then
 * pattern string (stable + deterministic).
 */
export function compareAssignments<T extends Pick<AssignmentLike, "pattern" | "priority">>(
  a: T,
  b: T,
): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (b.pattern.length !== a.pattern.length) return b.pattern.length - a.pattern.length;
  return a.pattern.localeCompare(b.pattern);
}

/**
 * Pick the winning assignment for a URL path. Filters out inactive
 * assignments and unpublished templates. Returns null when nothing matches.
 */
export function resolveAssignment<T extends AssignmentLike>(
  assignments: readonly T[],
  urlPath: string,
): T | null {
  const eligible = assignments.filter(
    (a) => a.active && a.template?.isPublished,
  );
  const sorted = [...eligible].sort(compareAssignments);
  for (const a of sorted) {
    if (matchPattern(a.pattern, urlPath)) return a;
  }
  return null;
}
