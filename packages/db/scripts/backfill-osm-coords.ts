// Spec #4 A3 (#194) — backfill lat/lng for District/Constituency/Mandal from
// OpenStreetMap Nominatim. Feeds NewsArticle contentLocation + spatialCoverage
// JSON-LD downstream (Phase B1 #197). Idempotent — skips rows already set
// unless --force is passed.
//
// Nominatim policy: ≤1 req/sec + real User-Agent. We sleep 1.5s between
// requests. Source: https://operations.osmfoundation.org/policies/nominatim/
//
// Usage:
//   bun packages/db/scripts/backfill-osm-coords.ts
//   bun packages/db/scripts/backfill-osm-coords.ts --force
//   bun packages/db/scripts/backfill-osm-coords.ts --level=district
//   bun packages/db/scripts/backfill-osm-coords.ts --level=constituency
//   bun packages/db/scripts/backfill-osm-coords.ts --level=mandal

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");
const LEVEL_ARG = process.argv.find((a) => a.startsWith("--level="))?.split("=")[1];
const SLEEP_MS = 1500;
const USER_AGENT = "RayalaseemaExpress/1.0 (admin SEO backfill; +https://rayalaseemanews.com)";

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const arr = (await res.json()) as { lat: string; lon: string }[];
  if (!arr.length) return null;
  return { lat: Number(arr[0].lat), lng: Number(arr[0].lon) };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function backfillDistricts() {
  const rows = await prisma.district.findMany({
    where: FORCE ? {} : { OR: [{ lat: null }, { lng: null }] },
    select: { id: true, nameEn: true },
    orderBy: { sortOrder: "asc" },
  });
  console.log(`Districts to backfill: ${rows.length}`);
  for (const d of rows) {
    const coords = await geocode(`${d.nameEn} District, Andhra Pradesh, India`);
    if (coords) {
      await prisma.district.update({ where: { id: d.id }, data: coords });
      console.log(`  ${d.nameEn} -> ${coords.lat}, ${coords.lng}`);
    } else {
      console.log(`  ${d.nameEn} -> NOT FOUND`);
    }
    await sleep(SLEEP_MS);
  }
}

async function backfillConstituencies() {
  const rows = await prisma.constituency.findMany({
    where: FORCE ? {} : { OR: [{ lat: null }, { lng: null }] },
    select: { id: true, nameEn: true, district: { select: { nameEn: true } } },
    orderBy: { acNumber: "asc" },
  });
  console.log(`Constituencies to backfill: ${rows.length}`);
  for (const c of rows) {
    const clean = c.nameEn.replace(/\s*\(.+\)\s*$/, "").trim();
    const coords = await geocode(`${clean}, ${c.district.nameEn} District, Andhra Pradesh, India`);
    if (coords) {
      await prisma.constituency.update({ where: { id: c.id }, data: coords });
      console.log(`  ${clean} (${c.district.nameEn}) -> ${coords.lat}, ${coords.lng}`);
    } else {
      console.log(`  ${clean} (${c.district.nameEn}) -> NOT FOUND`);
    }
    await sleep(SLEEP_MS);
  }
}

async function backfillMandals() {
  const rows = await prisma.mandal.findMany({
    where: FORCE ? {} : { OR: [{ lat: null }, { lng: null }] },
    select: { id: true, nameEn: true, constituency: { select: { district: { select: { nameEn: true } } } } },
    orderBy: { sortOrder: "asc" },
  });
  const eta = Math.ceil((rows.length * SLEEP_MS) / 60000);
  console.log(`Mandals to backfill: ${rows.length} (ETA ~${eta} min)`);
  for (const m of rows) {
    const coords = await geocode(`${m.nameEn}, ${m.constituency.district.nameEn} District, Andhra Pradesh, India`);
    if (coords) {
      await prisma.mandal.update({ where: { id: m.id }, data: coords });
      console.log(`  ${m.nameEn} (${m.constituency.district.nameEn}) -> ${coords.lat}, ${coords.lng}`);
    } else {
      console.log(`  ${m.nameEn} (${m.constituency.district.nameEn}) -> NOT FOUND`);
    }
    await sleep(SLEEP_MS);
  }
}

async function main() {
  const levels = LEVEL_ARG ? [LEVEL_ARG] : ["district", "constituency", "mandal"];
  for (const level of levels) {
    if (level === "district") await backfillDistricts();
    else if (level === "constituency") await backfillConstituencies();
    else if (level === "mandal") await backfillMandals();
    else console.warn(`Unknown level: ${level}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
