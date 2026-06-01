// Dense broadsheet e-paper templates - Eenadu-style multi-column layout.
// Rendered by Playwright (headless Chromium) to a 1200x2000 broadsheet PNG.

export interface EpaperArticle {
  slug: string;
  title: string;
  summary?: string | null;
  featuredImage?: string | null;
  categoryName?: string | null;
  deskName?: string | null;   // Telugu byline (e.g. "రాయలసీమ న్యూస్ బిజినెస్ డెస్క్", "ప్రొద్దుటూరు")
}

export interface PageOptions {
  isFront: boolean;
  sectionLabel: string;
  dateLabel: string;
  pageNumber: number;
  totalPages: number;
  lead: EpaperArticle;
  majors: EpaperArticle[];     // 2 mid-size stories, photo + dek
  secondary: EpaperArticle[];  // 3 small stories, photo + headline
  briefs: EpaperArticle[];     // up to 10 headline-only
  adTop?: string | null;       // top banner ad image
  adBottom?: string | null;    // bottom strip ad image
}

const FONTS =
  "https://fonts.googleapis.com/css2?family=Ramabhadra&family=Noto+Serif+Telugu:wght@400;500;600;700;800;900&family=Noto+Sans+Telugu:wght@400;600;700;800&display=swap";

function esc(s: string | null | undefined): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function img(url: string | null | undefined, cls: string): string {
  return url
    ? `<div class="ph ${cls}"><img src="${esc(url)}" /></div>`
    : `<div class="ph ${cls} noimg">రాయలసీమ న్యూస్</div>`;
}

/** Build a dense broadsheet page as an HTML document string. */
export function renderBroadsheetPage(o: PageOptions): string {
  const head = o.isFront
    ? `<div class="masthead">
         <div class="mast-side">ఈ-ఎడిషన్<br/>${esc(o.dateLabel)}</div>
         <div class="mast-mid">
           <div class="mast-logo">రాయలసీమ న్యూస్</div>
           <div class="mast-tag">- THE VOICE OF RAYALASEEMA -</div>
         </div>
         <div class="mast-side r">కర్నూలు · నంద్యాల · అనంతపురం<br/>కడప · తిరుపతి · చిత్తూరు</div>
       </div>
       <div class="breakbar">తాజా · ${esc(o.lead.title).slice(0, 90)}</div>`
    : `<div class="secbar">
         <span class="secbar-name">${esc(o.sectionLabel)}</span>
         <span class="secbar-meta">రాయలసీమ న్యూస్ · ${esc(o.dateLabel)} · పేజీ ${o.pageNumber}</span>
       </div>`;

  // Lead - spans 4 cols: kicker, banner headline, byline, photo, 3-col justified dek
  const lead = `
    <article class="lead" data-slug="${esc(o.lead.slug)}">
      ${o.lead.categoryName ? `<div class="kicker">${esc(o.lead.categoryName)}</div>` : ""}
      <h1 class="lead-hl">${esc(o.lead.title)}</h1>
      ${o.lead.deskName ? `<div class="byline">- ${esc(o.lead.deskName)}</div>` : ""}
      ${img(o.lead.featuredImage, "lead-img")}
      ${o.lead.summary ? `<p class="lead-dek">${esc(o.lead.summary)}</p>` : ""}
    </article>`;

  // Majors - 2 stories stacked in the right 2 cols
  const majors = `
    <div class="majcol">
      ${o.majors
        .slice(0, 2)
        .map(
          (a) => `
        <article class="major" data-slug="${esc(a.slug)}">
          ${img(a.featuredImage, "maj-img")}
          ${a.categoryName ? `<div class="kicker sm">${esc(a.categoryName)}</div>` : ""}
          <h2 class="maj-hl">${esc(a.title)}</h2>
          ${a.deskName ? `<div class="byline sm">- ${esc(a.deskName)}</div>` : ""}
          ${a.summary ? `<p class="maj-dek">${esc(a.summary)}</p>` : ""}
        </article>`
        )
        .join("")}
    </div>`;

  // Secondary - 3-across band
  const secondary = `
    <div class="secrow">
      ${o.secondary
        .slice(0, 3)
        .map(
          (a) => `
        <article class="sec" data-slug="${esc(a.slug)}">
          ${img(a.featuredImage, "sec-img")}
          <h3 class="sec-hl">${esc(a.title)}</h3>
        </article>`
        )
        .join("")}
    </div>`;

  // Briefs - 2-col headline list
  const briefs = o.briefs.length
    ? `<div class="briefs">
         <div class="briefs-head">క్లుప్త వార్తలు</div>
         <div class="briefs-cols">
           ${o.briefs
             .slice(0, 10)
             .map((a) => `<div class="brief" data-slug="${esc(a.slug)}"><span class="dot"></span><span>${esc(a.title)}</span></div>`)
             .join("")}
         </div>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="te"><head><meta charset="UTF-8">
<link href="${FONTS}" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:2000px}
  body{
    font-family:'Noto Serif Telugu',serif;
    background:#FCFAF3;color:#14110b;
    padding:26px 30px;display:flex;flex-direction:column;
  }

  /* ===== MASTHEAD ===== */
  .masthead{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #14110b;padding-bottom:10px}
  .mast-mid{text-align:center;flex:1}
  .mast-logo{font-family:'Ramabhadra',serif;font-size:62px;color:#A50D0D;line-height:1}
  .mast-tag{font-family:'Noto Sans Telugu',sans-serif;font-size:12px;letter-spacing:5px;color:#6b6155;margin-top:4px}
  .mast-side{font-family:'Noto Sans Telugu',sans-serif;font-size:11px;line-height:1.6;color:#6b6155;width:170px}
  .mast-side.r{text-align:right}
  .breakbar{
    background:#A50D0D;color:#fff;font-family:'Noto Sans Telugu',sans-serif;
    font-size:14px;font-weight:700;padding:6px 12px;margin:8px 0 14px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .secbar{
    display:flex;justify-content:space-between;align-items:baseline;
    background:#A50D0D;color:#fff;padding:10px 16px;margin-bottom:14px;
  }
  .secbar-name{font-family:'Ramabhadra',serif;font-size:32px}
  .secbar-meta{font-family:'Noto Sans Telugu',sans-serif;font-size:12px}

  .kicker{font-family:'Noto Sans Telugu',sans-serif;font-size:13px;font-weight:800;color:#A50D0D;text-transform:uppercase;letter-spacing:1px;margin-bottom:5px}
  .kicker.sm{font-size:10px;margin:5px 0 3px}
  .byline{font-family:'Noto Sans Telugu',sans-serif;font-size:13px;font-weight:700;color:#6b6155;margin:0 0 8px;font-style:italic}
  .byline.sm{font-size:10px;margin:2px 0 4px}

  /* ===== TOP BLOCK: lead (4col) + majors (2col) ===== */
  .topblock{display:grid;grid-template-columns:2fr 1fr;gap:0;border-bottom:3px double #14110b;padding-bottom:14px}
  .lead{padding-right:20px;border-right:1px solid #c9c1ad}
  .lead-hl{font-family:'Noto Serif Telugu',serif;font-weight:900;font-size:46px;line-height:1.16;margin-bottom:10px}
  .lead-img{height:300px;margin-bottom:10px}
  .lead-dek{
    font-size:16px;line-height:1.62;color:#34302a;text-align:justify;
    column-count:3;column-gap:18px;column-rule:1px solid #d8d0bd;
    display:-webkit-box;-webkit-line-clamp:9;-webkit-box-orient:vertical;overflow:hidden;
  }
  .majcol{padding-left:18px;display:flex;flex-direction:column;gap:14px}
  .major{border-bottom:1px dotted #c9c1ad;padding-bottom:12px}
  .major:last-child{border-bottom:none}
  .maj-img{height:140px;margin-bottom:7px}
  .maj-hl{font-family:'Noto Serif Telugu',serif;font-weight:800;font-size:22px;line-height:1.28;margin-bottom:5px}
  .maj-dek{font-size:13px;line-height:1.55;color:#4a443c;text-align:justify;
    display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}

  /* ===== SECONDARY ROW: 3 across ===== */
  .secrow{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:14px 0;border-bottom:3px double #14110b}
  .sec{padding-right:18px;border-right:1px solid #c9c1ad}
  .sec:last-child{border-right:none;padding-right:0}
  .sec-img{height:150px;margin-bottom:8px}
  .sec-hl{font-family:'Noto Serif Telugu',serif;font-weight:800;font-size:23px;line-height:1.3;
    display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}

  /* ===== IMAGES ===== */
  .ph{width:100%;overflow:hidden;background:#e9e3d4;border:1px solid #d3cab5}
  .ph img{width:100%;height:100%;object-fit:cover;display:block}
  .ph.noimg{display:flex;align-items:center;justify-content:center;
    font-family:'Ramabhadra',serif;color:#bdb39c;font-size:24px}

  /* ===== BRIEFS ===== */
  .briefs{padding-top:14px;margin-top:auto}
  .briefs-head{font-family:'Ramabhadra',serif;font-size:24px;color:#A50D0D;margin-bottom:10px;
    border-bottom:2px solid #14110b;padding-bottom:5px}
  .briefs-cols{column-count:2;column-gap:30px;column-rule:1px solid #d8d0bd}
  .brief{display:flex;gap:9px;padding:7px 0;border-bottom:1px dotted #cdc6b5;break-inside:avoid;
    font-size:16px;font-weight:600;line-height:1.4}
  .brief span:last-child{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
  .dot{width:6px;height:6px;border-radius:50%;background:#A50D0D;flex-shrink:0;margin-top:7px}

  .adzone{width:100%;overflow:hidden;border:1px solid #d3cab5;background:#f0ebdd}
  .adzone img{width:100%;display:block;object-fit:cover}
  .adzone.adtop{margin:10px 0 14px;max-height:150px}
  .adzone.adbot{margin:14px 0 0;max-height:130px}

  .pagefoot{border-top:3px double #A50D0D;margin-top:14px;padding-top:7px;
    display:flex;justify-content:space-between;
    font-family:'Noto Sans Telugu',sans-serif;font-size:12px;color:#6b6155}
</style></head>
<body>
  ${head}
  ${o.adTop ? `<div class="adzone adtop"><img src="${esc(o.adTop)}" /></div>` : ""}
  <div class="topblock">${lead}${majors}</div>
  ${secondary}
  ${briefs}
  ${o.adBottom ? `<div class="adzone adbot"><img src="${esc(o.adBottom)}" /></div>` : ""}
  <div class="pagefoot">
    <span>www.rayalaseemanews.com</span>
    <span>${esc(o.sectionLabel)} · పేజీ ${o.pageNumber} / ${o.totalPages}</span>
  </div>
</body></html>`;
}
