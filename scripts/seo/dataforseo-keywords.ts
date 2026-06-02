#!/usr/bin/env bun
/**
 * DataForSEO keyword research for Rayalaseema News.
 *
 * Phase 1: search volume + CPC + competition for a curated seed list of
 *          Telugu + English regional + topical news keywords.
 * Phase 2: related keywords (semantically clustered by DFS) for the top seeds.
 * Phase 3: SERP snapshot — who currently ranks #1-10 for our top targets.
 *
 * Writes JSON output to docs/seo/keyword-research-YYYY-MM-DD.json
 *
 * Run: bun scripts/seo/dataforseo-keywords.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const BASE = "https://api.dataforseo.com";
const LOCATION_CODE = 2356; // India
const LANGUAGE_CODE_TE = "te";
const LANGUAGE_CODE_EN = "en";

// Seed keywords — brand, district, topic. Mix Telugu + English so DFS
// returns both for cross-language coverage.
const SEED_KEYWORDS = [
  // Brand
  "rayalaseema news",
  "rayalaseema news telugu",
  "రాయలసీమ వార్తలు",
  "రాయలసీమ న్యూస్",
  "rayalaseemanews",

  // District — English
  "kurnool news",
  "nandyal news",
  "anantapur news",
  "anantapuram news",
  "kadapa news",
  "ysr kadapa news",
  "chittoor news",
  "tirupati news",
  "sri sathya sai news",
  "annamayya news",

  // District — Telugu
  "కర్నూలు వార్తలు",
  "నంద్యాల వార్తలు",
  "అనంతపురం వార్తలు",
  "కడప వార్తలు",
  "చిత్తూరు వార్తలు",
  "తిరుపతి వార్తలు",

  // Topical
  "telugu news",
  "telugu news today",
  "ap news today",
  "andhra pradesh news",
  "తెలుగు వార్తలు",
  "తాజా వార్తలు",
  "ఆంధ్రప్రదేశ్ వార్తలు",
  "breaking news telugu",
  "telugu cinema news",
  "telugu politics news",
  "telugu cricket news",

  // Hyperlocal long-tail
  "kurnool politics",
  "tirupati temple news",
  "rayalaseema politics",
  "rayalaseema rains",
  "tungabhadra reservoir news",
  "ysrcp news",
  "tdp news",
  "jagan mohan reddy news",
  "chandrababu naidu news",
  "pawan kalyan news",

  // Service intent
  "mandi prices anantapur",
  "kurnool weather today",
  "tirupati darshan tickets news",
  "anantapur gold rate today",
];

function loadEnv(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return map;
}

const env = loadEnv();
const AUTH = `Basic ${env.DATAFORSEO_AUTH_B64}`;

async function dfs<T = any>(path: string, body: any[]): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status}\n${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

async function searchVolume(keywords: string[], languageCode: string) {
  const r = await dfs<any>("/v3/keywords_data/google_ads/search_volume/live", [
    {
      keywords,
      location_code: LOCATION_CODE,
      language_code: languageCode,
      include_serp_info: false,
    },
  ]);
  return r.tasks?.[0]?.result || [];
}

async function relatedKeywords(seed: string, languageCode: string, limit = 20) {
  const r = await dfs<any>("/v3/dataforseo_labs/google/related_keywords/live", [
    {
      keyword: seed,
      location_code: LOCATION_CODE,
      language_code: languageCode,
      limit,
      depth: 2,
    },
  ]);
  return r.tasks?.[0]?.result?.[0]?.items || [];
}

async function serpSnapshot(keyword: string, languageCode: string) {
  const r = await dfs<any>("/v3/serp/google/organic/live/regular", [
    {
      keyword,
      location_code: LOCATION_CODE,
      language_code: languageCode,
      device: "mobile",
      depth: 20,
    },
  ]);
  return r.tasks?.[0]?.result?.[0]?.items?.slice(0, 10) || [];
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const outFile = join("docs", "seo", `keyword-research-${today}.json`);
  if (!existsSync(dirname(outFile))) mkdirSync(dirname(outFile), { recursive: true });

  console.log(`DataForSEO keyword research for Rayalaseema News — ${today}`);
  console.log(`Location: IN (code ${LOCATION_CODE})`);
  console.log(`Output:   ${outFile}\n`);

  // Split seeds by likely language
  const teluguSeeds = SEED_KEYWORDS.filter((k) => /[ఀ-౿]/.test(k));
  const englishSeeds = SEED_KEYWORDS.filter((k) => !/[ఀ-౿]/.test(k));

  console.log(`Phase 1 — search volume (${teluguSeeds.length} TE + ${englishSeeds.length} EN seeds)...`);
  const volTE = teluguSeeds.length ? await searchVolume(teluguSeeds, LANGUAGE_CODE_TE) : [];
  const volEN = englishSeeds.length ? await searchVolume(englishSeeds, LANGUAGE_CODE_EN) : [];
  const allVolumes = [...volTE, ...volEN].sort((a: any, b: any) => (b.search_volume || 0) - (a.search_volume || 0));

  console.log(`\nTOP 20 BY SEARCH VOLUME:`);
  console.log("Keyword".padEnd(40), "Vol".padStart(8), "CPC".padStart(8), "Comp");
  console.log("-".repeat(70));
  for (const k of allVolumes.slice(0, 20)) {
    const v = k.search_volume ?? "-";
    const cpc = k.cpc ? `$${Number(k.cpc).toFixed(2)}` : "-";
    const comp = k.competition_level ?? k.competition ?? "-";
    console.log(String(k.keyword).slice(0, 38).padEnd(40), String(v).padStart(8), String(cpc).padStart(8), String(comp));
  }

  // Phase 2: related keywords for top 5 EN + top 5 TE
  console.log(`\nPhase 2 — related keywords (top 5 each language)...`);
  const topEN = volEN.filter((x: any) => x.search_volume).sort((a: any, b: any) => b.search_volume - a.search_volume).slice(0, 5);
  const topTE = volTE.filter((x: any) => x.search_volume).sort((a: any, b: any) => b.search_volume - a.search_volume).slice(0, 5);
  const related: Record<string, any[]> = {};
  for (const s of [...topEN, ...topTE]) {
    const lang = /[ఀ-౿]/.test(s.keyword) ? LANGUAGE_CODE_TE : LANGUAGE_CODE_EN;
    try {
      console.log(`  ${s.keyword}  (${lang}) ...`);
      related[s.keyword] = await relatedKeywords(s.keyword, lang);
    } catch (e: any) {
      console.log(`    err: ${String(e.message).split("\n")[0].slice(0, 150)}`);
      related[s.keyword] = [];
    }
  }

  // Phase 3: SERP snapshot for top 3 brand + 3 district keywords
  console.log(`\nPhase 3 — SERP snapshots for top brand + district keywords...`);
  const serpQueries = [
    "rayalaseema news",
    "rayalaseema news telugu",
    "telugu news",
    "kurnool news",
    "tirupati news",
    "kadapa news",
  ];
  const serps: Record<string, any[]> = {};
  for (const q of serpQueries) {
    const lang = /[ఀ-౿]/.test(q) ? LANGUAGE_CODE_TE : LANGUAGE_CODE_EN;
    try {
      console.log(`  "${q}" ...`);
      serps[q] = await serpSnapshot(q, lang);
      const ours = serps[q].find((r: any) => r.url?.includes("rayalaseemanews.com"));
      console.log(`    top: ${serps[q][0]?.domain}  | our rank: ${ours ? `#${ours.rank_absolute}` : "not in top 20"}`);
    } catch (e: any) {
      console.log(`    err: ${String(e.message).split("\n")[0].slice(0, 150)}`);
      serps[q] = [];
    }
  }

  // Write full output
  const payload = {
    generated: new Date().toISOString(),
    location: { code: LOCATION_CODE, name: "India" },
    seeds: SEED_KEYWORDS,
    volumes: allVolumes,
    related,
    serps,
  };
  writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\n✓ Full data written to ${outFile}`);
  console.log("");
  console.log("Next steps:");
  console.log("  bun scripts/seo/dataforseo-summarize.ts " + outFile);
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
