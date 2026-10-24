// Does a title carry a person or place from the story? Entities come from the
// model in Telugu; titles carry names in Telugu (often inflected: కేతిరెడ్డికి)
// or in English (Dharmavaram). Canonical spellings come from places.ts and
// people.ts so either script counts.
import { PLACES, DISTRICTS } from "./places";
import { PEOPLE } from "./people";

/** Words that appear inside entity names but are not names on their own. */
const GENERIC = new Set([
  "జిల్లా", "జిల్లాలో", "district", "సీఐ", "ci", "ఎమ్మెల్యే", "mla", "ఎంపీ", "mp", "రెడ్డి", "reddy", "నాయుడు", "naidu",
  "పోలీస్", "police", "మాజీ", "ex", "former", "శ్రీ", "sri", "మండలం", "mandal", "టౌన్", "town", "news", "నగరం", "city",
  "మంత్రి", "minister", "డాక్టర్", "dr", "ఎస్ఐ", "si", "డీఎస్పీ", "dsp", "ఎస్పీ", "sp",
]);

const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
const cps = (s: string) => [...s].length;

/** Every spelling we know for one entity string: itself plus canonical te/en forms and aliases. */
export function nameForms(entity: string): string[] {
  const out = new Set<string>([entity]);
  const low = entity.toLowerCase();
  for (const p of PLACES) if (p.te === entity || p.en.toLowerCase() === low) { out.add(p.en); out.add(p.te); }
  for (const [en, te] of Object.entries(DISTRICTS)) {
    if (te === entity || en.toLowerCase() === low || entity.startsWith(te) || low.startsWith(en.toLowerCase())) { out.add(en); out.add(te); }
  }
  for (const p of PEOPLE) {
    if (p.te === entity || p.en.toLowerCase() === low || p.aliases.includes(entity)) { out.add(p.en); out.add(p.te); for (const a of p.aliases) out.add(a); }
  }
  return [...out];
}

export function nameInTitle(title: string, entities: { people: string[]; places: string[] }): boolean {
  const low = title.toLowerCase();
  const tt = tokens(title);
  for (const e of [...entities.people, ...entities.places]) {
    for (const f of nameForms(e)) {
      const fl = f.toLowerCase();
      if (cps(fl) >= 3 && low.includes(fl)) return true;
      for (const tok of tokens(f)) {
        if (GENERIC.has(tok) || cps(tok) < 3) continue;
        if (tt.some((t) => t.startsWith(tok))) return true; // Telugu case endings: కేతిరెడ్డికి ← కేతిరెడ్డి
      }
    }
  }
  return false;
}

/** A Rayalaseema place or a known person in English: the search terms the channel's viewers actually type. */
export function knownNameIn(english: string): boolean {
  const low = english.toLowerCase();
  if (PLACES.some((p) => low.includes(p.en.toLowerCase()))) return true;
  if (Object.keys(DISTRICTS).some((d) => low.includes(d.toLowerCase()))) return true;
  return PEOPLE.some((p) => low.includes(p.en.toLowerCase()) || p.aliases.some((a) => /[A-Za-z]/.test(a) && cps(a) >= 4 && low.includes(a.toLowerCase())));
}

/**
 * The 15 search-term points: a priced term in the English half earns a
 * log-scaled bonus; with no priced term, a known place or person earns the
 * full 15 (that is what gets searched when DataForSEO has no data).
 */
export function searchTermBonus(english: string, volumes: Map<string, number | null>): number {
  const low = english.toLowerCase();
  let bonus = 0;
  for (const [term, v] of volumes) if (v && low.includes(term.toLowerCase())) bonus = Math.max(bonus, Math.min(15, Math.log10(v) * 5));
  if (bonus > 0) return bonus;
  return knownNameIn(english) ? 15 : 0;
}

/** Canonical English spelling of an entity when places.ts / people.ts know it; null otherwise. */
export function englishNameOf(entity: string): string | null {
  const low = entity.toLowerCase();
  for (const p of PLACES) if (p.te === entity || p.en.toLowerCase() === low) return p.en;
  for (const [en, te] of Object.entries(DISTRICTS)) if (te === entity || en.toLowerCase() === low || entity.startsWith(te)) return en;
  for (const p of PEOPLE) if (p.te === entity || p.en.toLowerCase() === low || p.aliases.includes(entity)) return p.en;
  return null;
}
