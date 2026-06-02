// Pulls today's gold + silver + platinum spot and writes per-Rayalaseema-city
// rows into PreciousMetalRate so the homepage ticker, the /gold-rate page, and
// the admin table all render city-wise rates.
//
// Source cascade (first that succeeds wins):
//   1. gold-api.com  - FREE, NO KEY, includes Gold/Silver/Platinum. Returns
//      USD per troy ounce; we convert oz→gram and USD→INR (live FX). Primary
//      because it's keyless, reliable, and the only free source with platinum.
//   2. GoldAPI.io    - needs GOLDAPI_KEY; returns INR/gram directly (gold+silver).
//   3. goldprice.org - free but anonymous-rate-limited (gold+silver).
//   4. forex-approx  - USD/INR × hardcoded spot estimate; last-ditch so a sync
//      never leaves the table empty.
//
// Retail premium: spot is the *international bullion* price. Indian jeweller
// RETAIL rates (what readers compare against, e.g. Lalithaa Jewellery) run
// above spot by a metal-specific margin (making + GST + local premium). We
// multiply spot by RETAIL_PREMIUM to land near those retail figures; editors
// can tune these or override any single row in /precious-metals.
//
// Idempotent within the same day: re-running updates the existing row for
// (city, metal, purity, today) instead of duplicating.
//
// Used by:
//   - apps/admin/src/app/api/cron/fetch-precious-metals/route.ts (daily cron)
//   - apps/admin/src/app/api/precious-metals/sync/route.ts (admin button)
import { prisma } from "@rayalaseema/db";

const OZ_TO_GRAM = 31.1035;

// Multipliers applied to international spot to approximate Indian jeweller
// retail (calibrated against Lalithaa Jewellery's published per-gram rates).
// Set a value to 1.0 to publish pure spot for that metal. Env overrides:
// PM_PREMIUM_GOLD / PM_PREMIUM_SILVER / PM_PREMIUM_PLATINUM.
const RETAIL_PREMIUM = {
  gold: Number(process.env.PM_PREMIUM_GOLD) || 1.03,
  silver: Number(process.env.PM_PREMIUM_SILVER) || 1.24,
  platinum: Number(process.env.PM_PREMIUM_PLATINUM) || 1.29,
};

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

// Per-gram ₹ offsets layered on top of the premium-adjusted base, so cities
// differ plausibly instead of being identical. Editors override individual
// rows in /precious-metals when the local actual price diverges.
const CITY_OFFSETS: Record<string, { gold: number; silver: number; platinum: number }> = {
  Hyderabad:    { gold:   0, silver: 0, platinum: 0 },
  Vijayawada:   { gold:  10, silver: 0, platinum: 0 },
  Kurnool:      { gold:   5, silver: 0, platinum: 0 },
  Nandyal:      { gold:   8, silver: 0, platinum: 0 },
  Anantapuramu: { gold:  -5, silver: 0, platinum: 0 },
  Kadapa:       { gold:  -3, silver: 0, platinum: 0 },
  Tirupati:     { gold:  25, silver: 1, platinum: 5 },
  Chittoor:     { gold:  10, silver: 0, platinum: 0 },
  Nellore:      { gold:   5, silver: 0, platinum: 0 },
};

interface SpotRates {
  gold24kPerGram: number;
  silverPerGram: number;
  platinumPerGram: number | null; // null when the source has no platinum
  source: string;
  fetchedAt: Date;
}

// Live USD→INR for the USD/oz sources. Free, no key.
async function fetchUsdInr(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const inr = Number(data?.rates?.INR);
    return Number.isFinite(inr) && inr > 0 ? inr : null;
  } catch {
    return null;
  }
}

// Method 1 (primary): gold-api.com. Keyless, returns USD/oz for XAU/XAG/XPT.
async function fetchFromGoldApiCom(): Promise<SpotRates | null> {
  try {
    const [usdInr, xau, xag, xpt] = await Promise.all([
      fetchUsdInr(),
      fetch("https://api.gold-api.com/price/XAU", { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("https://api.gold-api.com/price/XAG", { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("https://api.gold-api.com/price/XPT", { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const goldUsdOz = Number(xau?.price);
    const silverUsdOz = Number(xag?.price);
    const platinumUsdOz = Number(xpt?.price);
    if (!usdInr || !Number.isFinite(goldUsdOz) || !Number.isFinite(silverUsdOz)) return null;
    const toInrGram = (usdOz: number) => (usdOz * usdInr) / OZ_TO_GRAM;
    return {
      gold24kPerGram: toInrGram(goldUsdOz),
      silverPerGram: toInrGram(silverUsdOz),
      platinumPerGram: Number.isFinite(platinumUsdOz) ? toInrGram(platinumUsdOz) : null,
      source: "gold-api.com",
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

// Method 2: GoldAPI.io (keyed). INR/gram directly. Gold + silver only.
async function fetchFromGoldApi(): Promise<SpotRates | null> {
  const key = process.env.GOLDAPI_KEY;
  if (!key) return null;
  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch("https://www.goldapi.io/api/XAU/INR", { headers: { "x-access-token": key }, signal: AbortSignal.timeout(6000) }),
      fetch("https://www.goldapi.io/api/XAG/INR", { headers: { "x-access-token": key }, signal: AbortSignal.timeout(6000) }),
    ]);
    if (!goldRes.ok || !silverRes.ok) return null;
    const [gold, silver] = await Promise.all([goldRes.json(), silverRes.json()]);
    if (!gold?.price_gram_24k || !silver?.price_gram) return null;
    return {
      gold24kPerGram: Number(gold.price_gram_24k),
      silverPerGram: Number(silver.price_gram),
      platinumPerGram: null,
      source: "goldapi.io",
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

// Method 3: goldprice.org public JSON (gold + silver, INR/oz).
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
      platinumPerGram: null,
      source: "goldprice.org",
      fetchedAt: new Date(),
    };
  } catch {
    return null;
  }
}

// Method 4: forex-derived safety net so a sync never returns empty.
async function fetchFromForexApprox(): Promise<SpotRates | null> {
  const inr = await fetchUsdInr();
  if (!inr) return null;
  // Spot estimates valid as of mid-2026; revisit if wholesale moves >~10%.
  const goldSpotUsdPerOz = 4500;
  const silverSpotUsdPerOz = 76;
  const platinumSpotUsdPerOz = 1960;
  return {
    gold24kPerGram: (goldSpotUsdPerOz * inr) / OZ_TO_GRAM,
    silverPerGram: (silverSpotUsdPerOz * inr) / OZ_TO_GRAM,
    platinumPerGram: (platinumSpotUsdPerOz * inr) / OZ_TO_GRAM,
    source: "forex-approx",
    fetchedAt: new Date(),
  };
}

async function fetchSpot(): Promise<SpotRates | null> {
  return (
    (await fetchFromGoldApiCom()) ||
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
    return { ok: false, error: "Spot rate source unreachable - all providers returned no data" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Apply the retail premium once to the base, then per-city ₹ offsets.
  const goldBase24 = spot.gold24kPerGram * RETAIL_PREMIUM.gold;
  const silverBase = spot.silverPerGram * RETAIL_PREMIUM.silver;
  const platinumBase =
    spot.platinumPerGram != null ? spot.platinumPerGram * RETAIL_PREMIUM.platinum : null;

  let written = 0;
  for (const city of CITIES) {
    const offset = CITY_OFFSETS[city.en] || { gold: 0, silver: 0, platinum: 0 };
    const gold24 = Math.round(goldBase24 + offset.gold);
    const gold22 = Math.round(gold24 * 0.916); // standard 22K/24K ratio
    const silver = Math.round(silverBase + offset.silver);

    const variants: { metal: "GOLD" | "SILVER" | "PLATINUM"; purity: string | null; price: number }[] = [
      { metal: "GOLD", purity: "24K", price: gold24 },
      { metal: "GOLD", purity: "22K", price: gold22 },
      { metal: "SILVER", purity: null, price: silver },
    ];
    if (platinumBase != null) {
      variants.push({ metal: "PLATINUM", purity: null, price: Math.round(platinumBase + offset.platinum) });
    }

    for (const v of variants) {
      const existing = await prisma.preciousMetalRate.findFirst({
        where: { city: city.en, metal: v.metal, purity: v.purity, date: { gte: today } },
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
