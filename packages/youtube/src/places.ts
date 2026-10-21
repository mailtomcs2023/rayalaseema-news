// Rayalaseema gazetteer used for place detection in titles and transcripts.
// Towns are listed before district headquarters so a town wins over its
// district name when both appear ("కడప జిల్లా పులివెందులలో" → Pulivendula).

export type Place = { en: string; te: string; district: string; districtTe: string };

export const DISTRICTS: Record<string, string> = {
  Kadapa: "కడప",
  Annamayya: "అన్నమయ్య",
  Kurnool: "కర్నూలు",
  Nandyal: "నంద్యాల",
  Anantapur: "అనంతపురం",
  "Sri Sathya Sai": "శ్రీ సత్యసాయి",
  Tirupati: "తిరుపతి",
  Chittoor: "చిత్తూరు",
};

const P = (en: string, te: string, district: string): Place => ({ en, te, district, districtTe: DISTRICTS[district] });

export const PLACES: Place[] = [
  P("Proddatur", "ప్రొద్దుటూరు", "Kadapa"),
  P("Pulivendula", "పులివెందుల", "Kadapa"),
  P("Jammalamadugu", "జమ్మలమడుగు", "Kadapa"),
  P("Yerraguntla", "యర్రగుంట్ల", "Kadapa"),
  P("Vempalli", "వెంపల్లి", "Kadapa"),
  P("Vempalli", "వేంపల్లి", "Kadapa"),
  P("Mydukur", "మైదుకూరు", "Kadapa"),
  P("Badvel", "బద్వేలు", "Kadapa"),
  P("Badvel", "బద్వేల్", "Kadapa"),
  P("Porumamilla", "పోరుమామిళ్ల", "Kadapa"),
  P("Kamalapuram", "కమలాపురం", "Kadapa"),
  P("Rayachoti", "రాయచోటి", "Annamayya"),
  P("Madanapalle", "మదనపల్లె", "Annamayya"),
  P("Pileru", "పీలేరు", "Annamayya"),
  P("Rajampet", "రాజంపేట", "Annamayya"),
  P("Adoni", "ఆదోని", "Kurnool"),
  P("Yemmiganur", "ఎమ్మిగనూరు", "Kurnool"),
  P("Nandikotkur", "నందికొట్కూరు", "Kurnool"),
  P("Pattikonda", "పత్తికొండ", "Kurnool"),
  P("Koilkuntla", "కోవెలకుంట్ల", "Nandyal"),
  P("Allagadda", "ఆళ్లగడ్డ", "Nandyal"),
  P("Srisailam", "శ్రీశైలం", "Nandyal"),
  P("Banaganapalle", "బనగానపల్లె", "Nandyal"),
  P("Dhone", "డోన్", "Nandyal"),
  P("Tadipatri", "తాడిపత్రి", "Anantapur"),
  P("Guntakal", "గుంతకల్లు", "Anantapur"),
  P("Kalyandurg", "కళ్యాణదుర్గం", "Anantapur"),
  P("Uravakonda", "ఉరవకొండ", "Anantapur"),
  P("Yadiki", "యాడికి", "Anantapur"),
  P("Hindupur", "హిందూపురం", "Sri Sathya Sai"),
  P("Kadiri", "కదిరి", "Sri Sathya Sai"),
  P("Dharmavaram", "ధర్మవరం", "Sri Sathya Sai"),
  P("Puttaparthi", "పుట్టపర్తి", "Sri Sathya Sai"),
  P("Penukonda", "పెనుకొండ", "Sri Sathya Sai"),
  P("Tirumala", "తిరుమల", "Tirupati"),
  P("Srikalahasti", "శ్రీకాళహస్తి", "Tirupati"),
  P("Puttur", "పుత్తూరు", "Tirupati"),
  P("Pakala", "పాకాల", "Tirupati"),
  P("Kuppam", "కుప్పం", "Chittoor"),
  P("Palamaner", "పలమనేరు", "Chittoor"),
  P("Punganur", "పుంగనూరు", "Chittoor"),
  P("Nagari", "నగరి", "Chittoor"),
  // District headquarters last.
  P("Kadapa", "కడప", "Kadapa"),
  P("Kurnool", "కర్నూలు", "Kurnool"),
  P("Nandyal", "నంద్యాల", "Nandyal"),
  P("Anantapur", "అనంతపురం", "Anantapur"),
  P("Tirupati", "తిరుపతి", "Tirupati"),
  P("Chittoor", "చిత్తూరు", "Chittoor"),
];

// Short forms the desk uses that are not a full town name.
const ALIASES: Array<[string, string]> = [
  ["అనంత ", "Anantapur"],
  ["అనంతలో", "Anantapur"],
];

// "కడప జిల్లా" / "Kadapa district" names the district, not the HQ town.
const DISTRICT_WORD = /^\s*(జిల్లా|district)/i;

function positions(text: string): Array<{ p: Place; at: number; districtRef: boolean }> {
  const lower = text.toLowerCase();
  const out: Array<{ p: Place; at: number; districtRef: boolean }> = [];
  for (const p of PLACES) {
    const cands = [
      [text.indexOf(p.te), p.te.length],
      [lower.indexOf(p.en.toLowerCase()), p.en.length],
    ].filter(([i]) => i >= 0);
    if (!cands.length) continue;
    const [at, len] = cands.sort((a, b) => a[0] - b[0])[0];
    const districtRef = p.en === p.district && DISTRICT_WORD.test(text.slice(at + len));
    out.push({ p, at, districtRef });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Earliest-mentioned place in a title; a district reference loses to any town. */
export function detectPlace(title: string): Place | null {
  const pos = positions(title);
  const town = pos.find((x) => !x.districtRef);
  if (town) return town.p;
  if (pos.length) return pos[0].p;
  for (const [alias, en] of ALIASES) if (title.includes(alias)) return PLACES.find((p) => p.en === en) ?? null;
  return null;
}

/** Every distinct place mentioned, in order of first appearance. */
export function townsIn(text: string): Place[] {
  const seen = new Set<string>();
  return positions(text)
    .filter(({ p }) => (seen.has(p.en) ? false : (seen.add(p.en), true)))
    .map(({ p }) => p);
}

export function isRayalaseema(text: string): boolean {
  return detectPlace(text) !== null || text.includes("రాయలసీమ") || /rayalaseema/i.test(text);
}
