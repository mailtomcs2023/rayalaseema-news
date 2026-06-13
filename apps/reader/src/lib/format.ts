import type { Lang } from "../i18n";

// Strip HTML tags + collapse whitespace. Summaries come from the CMS and are
// usually plain text, but defensive against stray markup.
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Compact "time ago" label. ISO timestamp in, localized short string out.
// Bilingual because the whole app toggles te/en.
export function timeAgo(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const mins = Math.floor(secs / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  const te = (n: number, unit: string) => `${n} ${unit} క్రితం`;
  if (days >= 7) {
    return new Date(then).toLocaleDateString(lang === "te" ? "te-IN" : "en-IN", {
      day: "numeric",
      month: "short",
    });
  }
  if (lang === "te") {
    if (days >= 1) return te(days, "రోజుల");
    if (hrs >= 1) return te(hrs, "గంటల");
    if (mins >= 1) return te(mins, "నిమిషాల");
    return "ఇప్పుడే";
  }
  if (days >= 1) return `${days}d ago`;
  if (hrs >= 1) return `${hrs}h ago`;
  if (mins >= 1) return `${mins}m ago`;
  return "just now";
}

// Category display name honouring the active language. Telugu `name` is the
// canonical label; `nameEn` is the English fallback.
export function categoryLabel(
  cat: { name: string; nameEn: string | null } | null | undefined,
  lang: Lang,
): string {
  if (!cat) return "";
  if (lang === "en" && cat.nameEn) return cat.nameEn;
  return cat.name;
}
