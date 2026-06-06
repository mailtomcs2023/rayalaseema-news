// Single source of truth for constituency hub URLs. Constituencies are served
// at the NESTED /[district]/[constituency] path so they sit under their district
// and match the article permalink hierarchy (/[district]/[constituency]/<slug-id>).
// The legacy standalone /constituency/<slug> route 301s here.
// Mirrors districtHref()/categoryHref(); keep every internal constituency link
// going through this so a future URL change stays a one-file edit.
export function constituencyHref(districtSlug: string, constituencySlug: string): string {
  return `/${districtSlug}/${constituencySlug}`;
}
