/**
 * Inline byline formatting for the Sakshi/Eenadu newspaper style:
 *   "రాయలసీమ ఎక్స్‌ప్రెస్, బనగానపల్లె: <body starts here>"
 *
 * The Desk table stores names with a dash separator for geographic desks
 * ("రాయలసీమ ఎక్స్‌ప్రెస్ - బనగానపల్లె") to keep the standalone byline readable.
 * Inline, we swap the dash for a comma so it reads naturally as a dateline.
 */
export function formatInlineByline(deskName: string | null | undefined): string {
  if (!deskName) return "రాయలసీమ ఎక్స్‌ప్రెస్";
  return deskName.replace(/ - /g, ", ");
}

/**
 * English relative time. User feedback: Telugu transliteration of timestamps
 * ("1 గంటల క్రితం") read awkwardly with grammar mismatches; English short form
 * looks cleaner on cards & bylines.
 * Falls back to absolute date past 30 days.
 */
export function formatRelativeTelugu(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return day === 1 ? "1 day ago" : `${day} days ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Prepends a bold byline like "<b>రాయలసీమ ఎక్స్‌ప్రెస్, బనగానపల్లె:</b> " to the
 * start of the first paragraph in the article body. If the body doesn't begin
 * with a paragraph, just prepends to the start.
 */
export function injectInlineByline(bodyHtml: string, deskName: string | null | undefined): string {
  const prefix = formatInlineByline(deskName);
  const tag = `<b class="re-byline">${escapeHtml(prefix)}:</b> `;
  if (/^\s*<p[^>]*>/.test(bodyHtml)) {
    return bodyHtml.replace(/^(\s*<p[^>]*>)/, `$1${tag}`);
  }
  return `<p>${tag}</p>${bodyHtml}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
