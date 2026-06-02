// "Today's Gold Rate" data for the Andhra Pradesh card.
//
// Source: Lalithaa Jewellery's public pricing API, Andhra Pradesh state.
// USED WITH LALITHAA'S PERMISSION - this republishes their retail rates, so
// keep this enabled only while that agreement stands. Both the base URL and
// the state id are env-overridable so it can be repointed or disabled without
// a code change.
//
// Cached for 30 minutes (Next fetch revalidate) so a busy page never hammers
// their server - their "Price Manager" updates rates only a few times a day.

const BASE = process.env.LALITHAA_API_BASE || "https://api.lalithaajewellery.com/public";
const AP_STATE_ID = process.env.LALITHAA_AP_STATE_ID || "a8ed6ea8-50ce-40c4-b4ae-68b0207e93da";
const REVALIDATE_SECONDS = 1800;

export interface GoldRateCard {
  goldPerGram: number;
  silverPerGram: number;
  platinumPerGram: number;
  updatedAt: string; // raw ISO from the source, e.g. "2026-06-01T12:56:00"
}

export async function getApGoldRates(): Promise<GoldRateCard | null> {
  try {
    const res = await fetch(`${BASE}/pricings/latest?state_id=${AP_STATE_ID}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const p = json?.data?.prices;
    const gold = Number(p?.gold?.price);
    const silver = Number(p?.silver?.price);
    const platinum = Number(p?.platinum?.price);
    if (!Number.isFinite(gold) || !Number.isFinite(silver) || !Number.isFinite(platinum)) {
      return null;
    }
    return {
      goldPerGram: gold,
      silverPerGram: silver,
      platinumPerGram: platinum,
      updatedAt: String(json?.data?.rate_updated_time ?? ""),
    };
  } catch {
    return null;
  }
}

// Format the source timestamp as "1 Jun 2026, 12:56 pm". Parses the ISO parts
// directly (no Date()/timezone math) because the source value is already the
// intended display time (IST, no zone suffix).
export function formatRateTimestamp(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return "";
  const [, y, mo, d, hh, mm] = m;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = Number(d);
  const month = months[Number(mo) - 1] ?? mo;
  let h = Number(hh);
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${day} ${month} ${y}, ${h}:${mm} ${ampm}`;
}
