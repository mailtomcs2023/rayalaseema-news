import { NextResponse } from "next/server";
import { prisma } from "@rayalaseema/db";
import { getApGoldRates } from "@/lib/lalithaa-rates";

// Force this handler to be re-discovered by Turbopack after stale routing
// state; touch this comment if /api/tickers ever 404s in dev.
// Cache 5 min
let cache: any = null;
let cacheTime = 0;
const TTL = 5 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cacheTime < TTL) {
    return NextResponse.json(cache);
  }

  const [mandi, bullion, forex, cricket] = await Promise.all([
    getMandiPrices(),
    getBullionPrices(),
    getForexRates(),
    getCricketScores(),
  ]);

  cache = { mandi, bullion, forex, cricket, updatedAt: new Date().toISOString() };
  cacheTime = Date.now();

  return NextResponse.json(cache, {
    headers: { "Cache-Control": "public, s-maxage=300" },
  });
}

// ====== MANDI: from our DB ======
async function getMandiPrices() {
  try {
    return await prisma.mandiPrice.findMany({
      where: { active: true },
      orderBy: { date: "desc" },
      take: 10,
    });
  } catch { return []; }
}

// ====== BULLION: Gold & Silver ======
// Source cascade:
//   0. PreciousMetalRate DB rows entered by editors via /precious-metals
//      admin page. When rows exist for the current 24h window, the strip
//      shows per-city rates ("Kurnool 24K", "Tirupati 22K"...). Editors
//      reflect local jeweller prices that pure spot APIs cannot.
//   1. goldprice.org public JSON - no key, no signup, updates ~every 60s.
//      Same endpoint that powers goldprice.org's homepage widget. Returns
//      gold + silver per troy ounce in INR; we convert oz → gram.
//   2. GoldAPI.io demo key - kept as fallback in case goldprice.org changes
//      shape. Capped at 500 req/month but we only hit it when path 1 fails.
//   3. Forex-derived approximation (USD/INR × international spot estimate).
//   4. Hardcoded defaults so the ticker bar never shows zero.
async function getBullionPrices() {
  const OZ_TO_GRAM = 31.1035;

  // Method 0 (primary): Lalithaa Jewellery's Andhra Pradesh feed - the exact
  // per-gram retail rates (Gold 22KT, Silver, Platinum) shown on their site.
  // Used with permission; cached 30 min by lib/lalithaa-rates. Falls through
  // to the editor/DB cascade below if their API is unreachable.
  try {
    const ap = await getApGoldRates();
    if (ap) {
      return [
        { name: "బంగారం 22K", nameEn: "Gold 22KT", price: Math.round(ap.goldPerGram), unit: "గ్రాము", change: 0 },
        { name: "వెండి", nameEn: "Silver", price: Math.round(ap.silverPerGram), unit: "గ్రాము", change: 0 },
        { name: "ప్లాటినం", nameEn: "Platinum", price: Math.round(ap.platinumPerGram), unit: "గ్రాము", change: 0 },
      ];
    }
  } catch {
    // fall through to the DB / spot cascade below
  }

  // Method 1: PreciousMetalRate DB rows (editor-entered, per Rayalaseema city).
  // The /gold-rate page reads from this same table; surfacing the same rows
  // in the strip keeps the two views in sync. Only the freshest row per
  // (city, metal, purity) within the current 24h window is shown so stale
  // entries from days ago don't pollute the strip.
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await prisma.preciousMetalRate.findMany({
      where: { active: true, date: { gte: since } },
      orderBy: [{ city: "asc" }, { metal: "asc" }, { purity: "asc" }, { date: "desc" }],
    });
    if (rows.length > 0) {
      // Dedupe: keep only the newest row per (city, metal, purity).
      const seen = new Set<string>();
      const latest: typeof rows = [];
      for (const r of rows) {
        const key = `${r.city}|${r.metal}|${r.purity ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        latest.push(r);
      }
      return latest.map((r) => {
        const cityLabel = r.cityTe || r.city;
        const metalLabel =
          r.metal === "GOLD"
            ? r.purity
              ? `బంగారం ${r.purity}`
              : "బంగారం"
            : r.metal === "PLATINUM"
              ? "ప్లాటినం"
              : "వెండి";
        const metalEn =
          r.metal === "GOLD" ? `Gold ${r.purity ?? ""}` : r.metal === "PLATINUM" ? "Platinum" : "Silver";
        return {
          name: `${cityLabel} ${metalLabel}`,
          nameEn: `${r.city} ${metalEn}`.trim(),
          price: Math.round(r.pricePerGram),
          unit: "గ్రాము",
          change: 0,
        };
      });
    }
  } catch {
    // DB unavailable - fall through to external API cascade below.
  }

  // Method 1: goldprice.org - free, live, no key. Updates ~every 60s.
  // Returns { items: [{ xauPrice, xagPrice, pcXau, pcXag, ... }] } where
  // xauPrice / xagPrice are INR per troy ounce.
  try {
    const res = await fetch("https://data-asg.goldprice.org/dbXRates/INR", {
      signal: AbortSignal.timeout(5000),
      // 5-min cache matches the outer ticker cache; goldprice.org gets at
      // most one hit per cache window regardless of homepage traffic.
      next: { revalidate: 300 },
      headers: { "User-Agent": "RayalaseemaNews/1.0 (+admin)" },
    });
    if (res.ok) {
      const data = await res.json();
      const item = data?.items?.[0];
      if (item?.xauPrice && item?.xagPrice) {
        const gold24kPerGram = Math.round(item.xauPrice / OZ_TO_GRAM);
        const silverPerGram = Math.round(item.xagPrice / OZ_TO_GRAM);
        return [
          { name: "బంగారం 24K", nameEn: "Gold 24K", price: gold24kPerGram, unit: "గ్రాము", change: parseFloat((item.pcXau ?? 0).toFixed(2)) },
          { name: "బంగారం 22K", nameEn: "Gold 22K", price: Math.round(gold24kPerGram * 0.916), unit: "గ్రాము", change: parseFloat((item.pcXau ?? 0).toFixed(2)) },
          { name: "వెండి", nameEn: "Silver", price: silverPerGram, unit: "గ్రాము", change: parseFloat((item.pcXag ?? 0).toFixed(2)) },
        ];
      }
    }
  } catch {}

  // Method 2: GoldAPI.io (fallback). Requires GOLDAPI_KEY env var; the
  // previously-shipped "goldapi-demo" placeholder is no longer accepted.
  try {
    const goldApiKey = process.env.GOLDAPI_KEY;
    if (!goldApiKey) throw new Error("no GOLDAPI_KEY");
    const [goldRes, silverRes] = await Promise.all([
      fetch("https://www.goldapi.io/api/XAU/INR", {
        headers: { "x-access-token": goldApiKey },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 300 },
      }),
      fetch("https://www.goldapi.io/api/XAG/INR", {
        headers: { "x-access-token": goldApiKey },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 300 },
      }),
    ]);

    const [gold, silver] = await Promise.all([goldRes.json(), silverRes.json()]);

    if (gold.price_gram_24k && silver.price_gram) {
      return [
        { name: "బంగారం 24K", nameEn: "Gold 24K", price: Math.round(gold.price_gram_24k), unit: "గ్రాము", change: gold.ch ? parseFloat(gold.ch_pct?.toFixed(2)) : 0 },
        { name: "బంగారం 22K", nameEn: "Gold 22K", price: Math.round(gold.price_gram_22k || gold.price_gram_24k * 0.916), unit: "గ్రాము", change: gold.ch ? parseFloat(gold.ch_pct?.toFixed(2)) : 0 },
        { name: "వెండి", nameEn: "Silver", price: Math.round(silver.price_gram), unit: "గ్రాము", change: silver.ch ? parseFloat(silver.ch_pct?.toFixed(2)) : 0 },
      ];
    }
  } catch {}

  // Method 2: Fallback - calculate from forex rates
  try {
    const forexRes = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
    const forex = await forexRes.json();
    const inr = forex.rates?.INR || 84;
    const ozToGram = 31.1035;

    // Use approximate international spot: Gold ~$3300/oz, Silver ~$33/oz (April 2026)
    const gold24k = Math.round((3300 / ozToGram) * inr);
    const silverG = Math.round((33 / ozToGram) * inr);

    return [
      { name: "బంగారం 24K", nameEn: "Gold 24K", price: gold24k, unit: "గ్రాము", change: 0 },
      { name: "బంగారం 22K", nameEn: "Gold 22K", price: Math.round(gold24k * 0.916), unit: "గ్రాము", change: 0 },
      { name: "వెండి", nameEn: "Silver", price: silverG, unit: "గ్రాము", change: 0 },
    ];
  } catch {
    // Absolute fallback
    return [
      { name: "బంగారం 24K", nameEn: "Gold 24K", price: 8900, unit: "గ్రాము", change: 0 },
      { name: "బంగారం 22K", nameEn: "Gold 22K", price: 8150, unit: "గ్రాము", change: 0 },
      { name: "వెండి", nameEn: "Silver", price: 100, unit: "గ్రాము", change: 0 },
    ];
  }
}

// ====== FOREX: from exchangerate-api.com (free, accurate) ======
async function getForexRates() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/INR", {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (!data.rates) return [];

    const usd = data.rates.USD ? parseFloat((1 / data.rates.USD).toFixed(2)) : 0;
    const eur = data.rates.EUR ? parseFloat((1 / data.rates.EUR).toFixed(2)) : 0;
    const gbp = data.rates.GBP ? parseFloat((1 / data.rates.GBP).toFixed(2)) : 0;
    const aed = data.rates.AED ? parseFloat((1 / data.rates.AED).toFixed(2)) : 0;
    const sar = data.rates.SAR ? parseFloat((1 / data.rates.SAR).toFixed(2)) : 0;

    return [
      { name: "USD/INR", nameEn: "US Dollar", price: usd, icon: "$", flag: "🇺🇸" },
      { name: "EUR/INR", nameEn: "Euro", price: eur, icon: "€", flag: "🇪🇺" },
      { name: "GBP/INR", nameEn: "British Pound", price: gbp, icon: "£", flag: "🇬🇧" },
      { name: "AED/INR", nameEn: "UAE Dirham", price: aed, icon: "د.إ", flag: "🇦🇪" },
      { name: "SAR/INR", nameEn: "Saudi Riyal", price: sar, icon: "﷼", flag: "🇸🇦" },
    ];
  } catch { return []; }
}

// ====== CRICKET: live scores - ESPN Cricinfo first (free, no key) ======
// Source cascade:
//   1. ESPN Cricinfo public JSON - same endpoint that powers
//      cricinfo.com/live-cricket-scores. No key, updates within seconds of
//      ball-by-ball.
//   2. cricapi.com demo (100 req/day) - fallback.
//   3. cricbuzz-cricket on RapidAPI demo - final fallback.
async function getCricketScores() {
  // Method 1: ESPN Cricinfo unofficial JSON - free, live, no auth.
  // Returns LIVE matches when available; falls back to upcoming/recent
  // entries so the strip can render "Next: IND vs AUS, today 7pm" when no
  // match is currently in progress. The isLive flag lets the consumer
  // style differently (pulse dot vs static "Next:" prefix).
  try {
    const res = await fetch(
      "https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true",
      {
        signal: AbortSignal.timeout(6000),
        // 60s revalidate - cricket score changes faster than gold price,
        // but more than once a minute is rude to a free endpoint.
        next: { revalidate: 60 },
        headers: { "User-Agent": "RayalaseemaNews/1.0 (+admin)" },
      },
    );
    if (res.ok) {
      const data = await res.json();
      const matches: any[] = Array.isArray(data?.matches) ? data.matches : [];
      const live = matches.filter((m) => m?.state === "LIVE" || m?.statusType === "LIVE");
      const pool = live.length > 0 ? live : matches;
      if (pool.length > 0) {
        return pool.slice(0, 3).map((m: any) => {
          const teams = Array.isArray(m?.teams) ? m.teams : [];
          const t1 = teams[0]?.team?.abbreviation || teams[0]?.team?.shortName || teams[0]?.team?.name || "T1";
          const t2 = teams[1]?.team?.abbreviation || teams[1]?.team?.shortName || teams[1]?.team?.name || "T2";
          const score = teams
            .filter((t: any) => t?.score)
            .map((t: any) => ({
              team: t?.team?.abbreviation || t?.team?.shortName || "",
              runs: Number(t?.score?.runs ?? 0),
              wickets: Number(t?.score?.wickets ?? 0),
              overs: Number(t?.score?.overs ?? 0),
            }));
          const isLive = m?.state === "LIVE" || m?.statusType === "LIVE";
          return {
            id: String(m?.objectId || m?.id || `${t1}-${t2}`),
            name: m?.title || `${t1} vs ${t2}`,
            status: m?.statusText || m?.status || (isLive ? "Live" : "Upcoming"),
            isLive,
            venue: m?.ground?.longName || m?.ground?.name || "",
            matchType: m?.format || "",
            teams: [t1, t2],
            score,
          };
        });
      }
    }
  } catch {}

  // Method 2: cricapi.com (free 100 req/day)
  try {
    const res = await fetch("https://api.cricapi.com/v1/currentMatches?apikey=demo&offset=0", {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 },
    });
    const data = await res.json();
    if (data.status === "success" && data.data?.length > 0) {
      return data.data.slice(0, 3).map((m: any) => ({
        id: m.id,
        name: m.name || "",
        status: m.status || "",
        venue: m.venue || "",
        matchType: m.matchType || "",
        teams: [m.teamInfo?.[0]?.shortname || m.teams?.[0] || "", m.teamInfo?.[1]?.shortname || m.teams?.[1] || ""],
        score: m.score?.map((s: any) => ({
          team: s.inning?.split(" ")?.[0] || "",
          runs: s.r || 0,
          wickets: s.w || 0,
          overs: s.o || 0,
        })) || [],
      }));
    }
  } catch {}

  // Method 2: cricbuzz unofficial (free)
  try {
    const res = await fetch("https://cricbuzz-cricket.p.rapidapi.com/matches/v1/live", {
      headers: { "X-RapidAPI-Key": "demo", "X-RapidAPI-Host": "cricbuzz-cricket.p.rapidapi.com" },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 },
    });
    const data = await res.json();
    if (data.typeMatches?.[0]?.seriesMatches?.[0]?.seriesAdWrapper?.matches) {
      const matches = data.typeMatches[0].seriesMatches[0].seriesAdWrapper.matches;
      return matches.slice(0, 3).map((m: any) => ({
        id: m.matchInfo?.matchId,
        name: `${m.matchInfo?.team1?.teamSName} vs ${m.matchInfo?.team2?.teamSName}`,
        status: m.matchInfo?.status || "Live",
        score: [],
      }));
    }
  } catch {}

  return null;
}
