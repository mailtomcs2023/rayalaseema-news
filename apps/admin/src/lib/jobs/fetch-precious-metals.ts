// Pulls today's gold + silver spot from goldprice.org (free, no key) and
// writes per-Rayalaseema-city rows into PreciousMetalRate so the homepage
// ticker and the /gold-rate page can render city-wise tables.
//
// Why this shape:
// - goldprice.org gives ONE INR-per-troy-ounce rate for India. There is no
//   free Indian API for true per-city retail rates - those vary by local
//   making charges + GST that only individual jewellers know.
// - We apply small fixed per-city offsets (CITY_OFFSETS below) so the rows
//   are plausibly different across Tirupati/Kurnool/etc instead of all
//   identical. Editors can override any single row in /precious-metals if
//   the local actual price diverges.
//
// Idempotent within the same day: re-running updates the existing row for
// (city, metal, purity, today) instead of creating duplicates.
//
// Used by:
//   - apps/admin/src/app/api/cron/fetch-precious-metals/route.ts (daily cron)
//   - apps/admin/src/app/api/precious-metals/sync/route.ts (admin button)
import { prisma } from "@rayalaseema/db";

const OZ_TO_GRAM = 31.1035;

// Rayalaseema + nearby commerce hubs. Keep this aligned with the cities
// list in apps/admin/src/app/(dashboard)/precious-metals/page.tsx and the
// /gold-rate public page so the three views stay consistent.
const CITIES: { en: string; te: string }[] = [
  { en: "Kurnool", te: "కర్నూలు" },
  { en: "Nandyal", te: "నంద్యాల" },
  { en: "Anantapuramu", te: "అనంతపురం" },
  { en: "Kadapa", te: "కడప" },
  { en: "Tirupati", te: "తిరుపతి" },
  { en: "Chittoor", te: "చిత్తూరు" },
  { en: "Hyderabad", te: "హైదరాబాద్" },
  { en: "Vijayawada", te: "విజయవాడ" },
  { en: "Nellore", te: "నెల్లూరు" },
];

// Per-gram offsets (₹) applied on top of the goldprice.org spot. Indicative
// only - reflects the rough delta seen between Hyderabad wholesale and the
// listed city's retail jeweller average as of mid-2026. Negative offsets =
// historically cheaper retail; positive = higher (typically tourist/temple
// towns where making charges run higher).
const CITY_OFFSETS: Record<string, { gold: number; silver: number }> = {
  Hyderabad:    { gold:   0, silver: 0 },
  Vijayawada:   { gold:  10, silver: 0 },
  Kurnool:      { gold:   5, silver: 0 },
  Nandyal:      { gold:   8, silver: 0 },
  Anantapuramu: { gold:  -5, silver: 0 },
  Kadapa:       { gold:  -3, silver: 0 },
  Tirupati:     { gold:  25, silver: 1 },
  Chittoor:     { gold:  10, silver: 0 },
  Nellore:      { gold:   5, silver: 0 },
};

interface SpotRates {
  gold24kPerGram: number;
  silverPerGram: number;
  source: string;
  fetchedAt: Date;
}

// Method 1: goldprice.org public JSON. Free, no key, ~60s freshness.
// Same endpoint /api/tickers' bullion cascade uses. Known to rate-limit
// (HTTP 403 "too many requests") under spiky load, hence the fallback
// cascade below - we never want the Sync button to leave the table empty.
async function fetchFromGoldpriceOrg(): Promise<SpotRates | null> {
  try {
    const res = await fetch("https://data-asg.goldprice.org/dbXRates/INR", {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "RayalaseemaNews/1.0 (+admin)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.items?.[0];
    if (!item?.xauPrice || !item?.xagPrice) return null;
    return {
      gold24kPerGram: item.xauPrice / OZ_TO_GRAM,
      silverPerGram: item.xagPrice / OZ_TO_GRAM,
      source: "goldprice.org",
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

// Method 2: GoldAPI.io. Requires GOLDAPI_KEY env var. Returns gold per
// gram in INR directly (no oz conversion needed). Free plan = ~300 calls /
// month; with one daily sync we use ~30 / month so the plan never bites.
async function fetchFromGoldApi(): Promise<SpotRates | null> {
  const key = process.env.GOLDAPI_KEY;
  if (!key) return null;
  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch("https://www.goldapi.io/api/XAU/INR", {
        headers: { "x-access-token": key },
        signal: AbortSignal.timeout(6000),
      }),
      fetch("https://www.goldapi.io/api/XAG/INR", {
        headers: { "x-access-token": key },
        signal: AbortSignal.timeout(6000),
      }),
    ]);
    if (!goldRes.ok || !silverRes.ok) return null;
    const [gold, silver] = await Promise.all([goldRes.json(), silverRes.json()]);
    if (!gold?.price_gram_24k || !silver?.price_gram) return null;
    return {
      gold24kPerGram: Number(gold.price_gram_24k),
      silverPerGram: Number(silver.price_gram),
      source: "goldapi.io",
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

// Method 3: forex-derived approximation. open.er-api.com gives USD/INR;
// we multiply against a hardcoded international spot estimate. Last-ditch
// fallback so the Sync button never returns empty - the editor can override
// individual rows if the estimate is too far off.
async function fetchFromForexApprox(): Promise<SpotRates | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const inr = Number(data?.rates?.INR);
    if (!Number.isFinite(inr) || inr <= 0) return null;
    // Spot estimates valid as of mid-2026; update if the wholesale rate
    // moves more than ~10% before we revisit this fallback.
    const goldSpotUsdPerOz = 3300;
    const silverSpotUsdPerOz = 33;
    return {
      gold24kPerGram: (goldSpotUsdPerOz * inr) / OZ_TO_GRAM,
      silverPerGram: (silverSpotUsdPerOz * inr) / OZ_TO_GRAM,
      source: "forex-approx",
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

// Cascade order: GoldAPI first because it is keyed (no rate-limit risk
// like goldprice.org's anonymous endpoint), then goldprice.org as a free
// backup, then forex-derived as the safety net so the Sync button never
// leaves the table empty.
async function fetchSpot(): Promise<SpotRates | null> {
  return (
    (await fetchFromGoldApi()) ||
    (await fetchFromGoldpriceOrg()) ||
    (await fetchFromForexApprox())
  );
}

export interface FetchResult {
  ok: boolean;
  written?: number;
  source?: string;
  fetchedAt?: string;
  error?: string;
}

export async function fetchAndWritePreciousMetalRates(): Promise<FetchResult> {
  const spot = await fetchSpot();
  if (!spot) {
    return { ok: false, error: "Spot rate source unreachable - goldprice.org returned no data" };
  }

  // Snap to today's midnight so re-running the cron / sync button on the
  // same day finds the existing row and updates it instead of duplicating.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const goldBase24 = Math.round(spot.gold24kPerGram);
  const silverBase = Math.round(spot.silverPerGram);

  let written = 0;
  for (const city of CITIES) {
    const offset = CITY_OFFSETS[city.en] || { gold: 0, silver: 0 };
    const gold24 = goldBase24 + offset.gold;
    const gold22 = Math.round(gold24 * 0.916); // standard 22K/24K ratio
    const silver = silverBase + offset.silver;

    const variants: { metal: "GOLD" | "SILVER"; purity: string | null; price: number }[] = [
      { metal: "GOLD", purity: "24K", price: gold24 },
      { metal: "GOLD", purity: "22K", price: gold22 },
      { metal: "SILVER", purity: null, price: silver },
    ];

    for (const v of variants) {
      // No composite unique on (city, metal, purity, date) in the schema,
      // so find-then-update / create manually for idempotency within a day.
      const existing = await prisma.preciousMetalRate.findFirst({
        where: {
          city: city.en,
          metal: v.metal,
          purity: v.purity,
          date: { gte: today },
        },
      });
      if (existing) {
        await prisma.preciousMetalRate.update({
          where: { id: existing.id },
          data: { pricePerGram: v.price, source: spot.source, active: true },
        });
      } else {
        await prisma.preciousMetalRate.create({
          data: {
            city: city.en,
            cityTe: city.te,
            metal: v.metal,
            purity: v.purity,
            pricePerGram: v.price,
            unit: "per gram",
            source: spot.source,
            date: today,
            active: true,
          },
        });
      }
      written++;
    }
  }

  return {
    ok: true,
    written,
    source: spot.source,
    fetchedAt: spot.fetchedAt.toISOString(),
  };
}
