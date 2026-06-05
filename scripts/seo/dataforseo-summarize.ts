#!/usr/bin/env bun
/**
 * Read a DataForSEO keyword research JSON (from dataforseo-keywords.ts) and
 * produce a ranked, deduped, categorized keyword shortlist optimized for
 * "easy to rank" wins.
 *
 * Strategy:
 *  - Pool = seed keywords + all "related" keywords from Phase 2.
 *  - Score = search_volume / (1 + 10 * competition_index)  - favor low comp.
 *  - Cluster by regex into categories (district, topic, personality, service).
 *  - Pick top N per category until 100 KWs cover at least 50,000 total monthly
 *    searches (rough rule of thumb to hit 10K monthly visits at ~20% blended CTR).
 *
 * Outputs:
 *   docs/seo/keyword-shortlist-YYYY-MM-DD.md  - categorized table for editors
 *   docs/seo/keyword-shortlist-YYYY-MM-DD.csv - flat list for spreadsheets
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Vol = {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: number | string | null;
  competition_level?: string;
};

type Related = {
  keyword_data: {
    keyword: string;
    keyword_info?: {
      search_volume?: number;
      cpc?: number;
      competition?: number;
      competition_level?: string;
    };
  };
};

const TARGET_TOTAL_VOLUME = 50_000;
const TARGET_COUNT = 100;
const MIN_VOLUME = 100;
const MAX_COMPETITION_INDEX = 0.6;

const CATEGORIES: Array<[string, RegExp]> = [
  ["District - Kurnool/Nandyal",  /\b(kurnool|nandyal|కర్నూలు|నంద్యాల)\b/i],
  ["District - Anantapur/SSS",    /\b(anantapur|anantapuram|sri\s*sathya\s*sai|hindupur|penukonda|అనంతపురం|హిందూపురం)\b/i],
  ["District - Kadapa/Annamayya", /\b(kadapa|ysr|annamayya|rajampet|proddatur|కడప|అన్నమయ్య|రాజంపేట|ప్రొద్దుటూరు)\b/i],
  ["District - Chittoor/Tirupati", /\b(chittoor|tirupati|tirumala|sri\s*kalahasti|చిత్తూరు|తిరుపతి|తిరుమల)\b/i],
  ["Politics - AP",                 /\b(ysrcp|tdp|jana\s*sena|janasena|jagan|chandrababu|pawan\s*kalyan|nara\s*lokesh|ఆపార్టీ|వైసీపీ|టీడీపీ|జనసేన|జగన్|చంద్రబాబు|పవన్)\b/i],
  ["Cinema - Telugu",               /\b(telugu\s*(movie|cinema|film)|tollywood|prabhas|allu\s*arjun|chiranjeevi|mahesh\s*babu|jr\s*ntr|rashmika|samantha|తెలుగు\s*సినిమా|టాలీవుడ్)\b/i],
  ["Cricket / Sports",              /\b(cricket|ipl|t20|csk|rcb|క్రికెట్|ఐపీఎల్|ఐపీఎల్|sports|క్రీడలు)\b/i],
  ["Religion - Temples",            /\b(tirupati\s*(temple|darshan|tickets)|tirumala|venkateswara|srisailam|lepakshi|mahanandi|yaganti|temple|ttd|దర్శనం|ఆలయం|గుడి|శ్రీశైలం)\b/i],
  ["Weather / Agriculture",         /\b(weather|rains?|monsoon|mandi|crop|farmer|tungabhadra|krishna|వాతావరణం|వర్షం|మండి|రైతు|తుంగభద్ర)\b/i],
  ["Markets / Economy",             /\b(gold\s*rate|silver\s*rate|petrol|diesel|stock|share|బంగారం|వెండి|పెట్రోల్|డీజిల్)\b/i],
  ["Education / Exams",             /\b(exam|result|tet|eamcet|intermediate|ssc|university|board|పరీక్ష|ఫలితాలు)\b/i],
  ["Brand - Rayalaseema",           /\brayalaseema|seema|రాయలసీమ|సీమ/i],
  ["General Telugu News",           /telugu\s*news|breaking\s*news\s*telugu|తెలుగు\s*వార్తలు|తాజా\s*వార్తలు|ఆంధ్ర.*వార్తలు/i],
];

function classify(kw: string): string {
  for (const [name, re] of CATEGORIES) if (re.test(kw)) return name;
  return "Other";
}

function score(vol: number, compIndex: number): number {
  return vol / (1 + 10 * compIndex);
}

function compIndex(c: any): number {
  if (typeof c === "number") return c;
  if (typeof c === "string") {
    const f = parseFloat(c);
    if (!Number.isNaN(f)) return f;
  }
  return 0;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("usage: bun scripts/seo/dataforseo-summarize.ts <input.json>");
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(inputPath, "utf8"));

  // Pool all keywords + their volume/cpc/competition
  const pool = new Map<string, { vol: number; cpc: number; comp: number; level: string }>();

  for (const v of data.volumes || []) {
    const kw = v.keyword?.trim();
    if (!kw) continue;
    pool.set(kw.toLowerCase(), {
      vol: v.search_volume || 0,
      cpc: Number(v.cpc) || 0,
      comp: compIndex(v.competition),
      level: v.competition_level || "",
    });
  }

  for (const [_seed, items] of Object.entries<Related[]>(data.related || {})) {
    for (const it of items) {
      const kw = it.keyword_data?.keyword?.trim();
      if (!kw) continue;
      const info = it.keyword_data.keyword_info || {};
      const vol = info.search_volume || 0;
      if (vol < MIN_VOLUME) continue;
      const existing = pool.get(kw.toLowerCase());
      if (existing && existing.vol >= vol) continue;
      pool.set(kw.toLowerCase(), {
        vol,
        cpc: Number(info.cpc) || 0,
        comp: compIndex(info.competition),
        level: info.competition_level || "",
      });
    }
  }

  // Build candidate list (sorted by score within filter)
  const candidates = [...pool.entries()]
    .map(([kw, v]) => ({ kw, ...v, score: score(v.vol, v.comp), category: classify(kw) }))
    .filter((x) => x.vol >= MIN_VOLUME && x.comp <= MAX_COMPETITION_INDEX)
    .sort((a, b) => b.score - a.score);

  console.log(`Pool size: ${pool.size}`);
  console.log(`After filter (vol >= ${MIN_VOLUME} + comp_idx <= ${MAX_COMPETITION_INDEX}): ${candidates.length}\n`);

  // Pick top N per category until 100 KW + 50k volume reached.
  const byCat: Record<string, typeof candidates> = {};
  for (const c of candidates) (byCat[c.category] ||= []).push(c);
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1].length - a[1].length);

  const picked: typeof candidates = [];
  const seen = new Set<string>();
  const PER_CAT_CAP = 12;
  // Round-robin: top of each cat until 100
  let round = 0;
  while (picked.length < TARGET_COUNT) {
    let added = 0;
    for (const [_cat, arr] of sortedCats) {
      if (round >= PER_CAT_CAP) break;
      const idx = round;
      if (idx >= arr.length) continue;
      const c = arr[idx];
      if (seen.has(c.kw)) continue;
      seen.add(c.kw);
      picked.push(c);
      added++;
      if (picked.length >= TARGET_COUNT) break;
    }
    if (!added) break;
    round++;
  }

  // Stats
  const totalVol = picked.reduce((s, k) => s + k.vol, 0);
  console.log(`Selected ${picked.length} keywords | total monthly volume = ${totalVol.toLocaleString()}`);
  if (totalVol < TARGET_TOTAL_VOLUME) {
    console.warn(`  Warning: below target of ${TARGET_TOTAL_VOLUME.toLocaleString()} - broaden seeds or relax MAX_COMPETITION_INDEX.`);
  }

  // Group for markdown
  const grouped: Record<string, typeof candidates> = {};
  for (const k of picked) (grouped[k.category] ||= []).push(k);

  const today = new Date().toISOString().slice(0, 10);

  // Markdown
  const md: string[] = [];
  md.push(`# Rayalaseema News - Keyword Shortlist (${today})`);
  md.push("");
  md.push(`Pool: ${pool.size} keywords  ·  After filter: ${candidates.length}  ·  Selected: ${picked.length}  ·  Total monthly volume: **${totalVol.toLocaleString()}**`);
  md.push("");
  md.push(`Goal: 10,000 monthly visits at ~20% blended CTR + #1-3 rank for low-competition long-tail.`);
  md.push("");
  md.push(`Filter: min volume **${MIN_VOLUME}/mo**, max competition index **${MAX_COMPETITION_INDEX}**.`);
  md.push("");

  for (const [cat, kws] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
    md.push(`## ${cat}  (${kws.length})`);
    md.push("");
    md.push("| Keyword | Monthly Vol | CPC ($) | Competition |");
    md.push("|---|--:|--:|:--|");
    for (const k of kws) {
      md.push(`| ${k.kw} | ${k.vol.toLocaleString()} | ${k.cpc.toFixed(2)} | ${k.level || k.comp.toFixed(2)} |`);
    }
    md.push("");
  }

  const mdPath = join("docs", "seo", `keyword-shortlist-${today}.md`);
  writeFileSync(mdPath, md.join("\n"), "utf8");
  console.log(`\n✓ Markdown:  ${mdPath}`);

  // CSV
  const csv: string[] = ["category,keyword,monthly_volume,cpc_usd,competition_level,competition_index,score"];
  for (const k of picked) {
    csv.push([k.category, `"${k.kw.replace(/"/g, '""')}"`, k.vol, k.cpc.toFixed(2), k.level, k.comp.toFixed(2), k.score.toFixed(0)].join(","));
  }
  const csvPath = join("docs", "seo", `keyword-shortlist-${today}.csv`);
  writeFileSync(csvPath, csv.join("\n"), "utf8");
  console.log(`✓ CSV:       ${csvPath}`);
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
