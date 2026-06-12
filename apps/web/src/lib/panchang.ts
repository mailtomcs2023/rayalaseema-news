// Offline panchangam + festivals for the rashi-phalalu page.
//
// Replaces the old Prokerala API path (which ran out of credits and leaked a
// hard-coded client secret). Everything here is computed locally:
//   - tithi / nakshatra / yoga / karana / masa  -> mhah-panchang (astronomical)
//   - sunrise / sunset / rahu kalam              -> suncalc + standard segments
//   - festivals / holidays                       -> curated FESTIVALS_2026 below
//   - shubha muhurthams                          -> derived from auspicious
//     nakshatra + tithi combinations for the month
//
// No API keys, no network, no credits - survives deploys and never goes blank.

import { MhahPanchang } from "mhah-panchang";
import SunCalc from "suncalc";

// Kurnool - geographic centre we reckon the Rayalaseema panchangam from.
const LAT = 15.83;
const LON = 78.04;
const TZ = "Asia/Kolkata";

// ---- Telugu lookup tables (keyed by mhah-panchang's name_en_IN) ----

const TITHI_TE: Record<string, string> = {
  Padyami: "పాడ్యమి", Vidhiya: "విదియ", Vidiya: "విదియ", Thadiya: "తదియ",
  Chavithi: "చవితి", Chaviti: "చవితి", Panchami: "పంచమి", Shasti: "షష్ఠి",
  Sapthami: "సప్తమి", Ashtami: "అష్టమి", Navami: "నవమి", Dasami: "దశమి",
  Ekadasi: "ఏకాదశి", Dvadasi: "ద్వాదశి", Trayodasi: "త్రయోదశి",
  Chaturdasi: "చతుర్దశి", Punnami: "పౌర్ణమి", Amavasya: "అమావాస్య",
};

const NAKSHATRA_TE: Record<string, string> = {
  Ashwini: "అశ్విని", Dwija: "భరణి", Krittika: "కృత్తిక", Rohini: "రోహిణి",
  Mrigashirsha: "మృగశిర", Ardra: "ఆర్ద్ర", Punarvasu: "పునర్వసు", Pushya: "పుష్యమి",
  Ashlesha: "ఆశ్లేష", Magha: "మఘ", "Purva Phalguni": "పుబ్బ", "Uttara Phalguni": "ఉత్తర",
  Hasta: "హస్త", Chitra: "చిత్త", Swati: "స్వాతి", Vishakha: "విశాఖ",
  Anuradha: "అనూరాధ", Jyeshtha: "జ్యేష్ఠ", Mula: "మూల", "Purva Ashadha": "పూర్వాషాఢ",
  "Uttara Ashadha": "ఉత్తరాషాఢ", Sravana: "శ్రవణం", Dhanishta: "ధనిష్ఠ",
  Shatabhisha: "శతభిష", "Purva Bhadrapada": "పూర్వాభాద్ర", "Uttara Bhadrapada": "ఉత్తరాభాద్ర",
  Rebati: "రేవతి",
};

const YOGA_TE: Record<string, string> = {
  Vishkambha: "విష్కంభ", Prithi: "ప్రీతి", Ayushman: "ఆయుష్మాన్", Saubhagya: "సౌభాగ్య",
  Sobhana: "శోభన", Atiganda: "అతిగండ", Sukarman: "సుకర్మ", Dhrithi: "ధృతి",
  Soola: "శూల", Ganda: "గండ", Vridhi: "వృద్ధి", Dhruva: "ధ్రువ", Vyaghata: "వ్యాఘాత",
  Harshana: "హర్షణ", Vajra: "వజ్ర", Siddhi: "సిద్ధి", Vyatipata: "వ్యతీపాత",
  Variyan: "వరీయాన్", Parigha: "పరిఘ", Siva: "శివ", Siddha: "సిద్ధ", Sadhya: "సాధ్య",
  Subha: "శుభ", Sukla: "శుక్ల", Bramha: "బ్రహ్మ", Indra: "ఇంద్ర", Vaidhruthi: "వైధృతి",
};

const KARANA_TE: Record<string, string> = {
  Bawa: "బవ", Balava: "బాలవ", Kaulava: "కౌలవ", Taitula: "తైతిల", Garaja: "గరజ",
  Vanija: "వణిజ", Vishti: "విష్టి", Sakuna: "శకుని", Chatushpada: "చతుష్పాద",
  Nagava: "నాగవ", Kimstughana: "కింస్తుఘ్న",
};

const MASA_TE: Record<string, string> = {
  Chaitra: "చైత్ర", Baisakha: "వైశాఖ", Jyestha: "జ్యేష్ఠ", Asadha: "ఆషాఢ",
  Srabana: "శ్రావణ", Bhadraba: "భాద్రపద", Aswina: "ఆశ్వయుజ", Karttika: "కార్తీక",
  Margasira: "మార్గశిర", Pausa: "పుష్య", Magha: "మాఘ", Phalguna: "ఫాల్గుణ",
};

const PAKSHA_TE: Record<string, string> = { Shukla: "శుక్ల పక్షం", Krishna: "కృష్ణ పక్షం" };

const VAARA_TE = ["ఆదివారం", "సోమవారం", "మంగళవారం", "బుధవారం", "గురువారం", "శుక్రవారం", "శనివారం"];

// Rahu kalam = one of eight equal daylight segments, fixed by weekday.
// 0-based segment index from sunrise, indexed by getDay() (0=Sun).
const RAHU_SEGMENT = [7, 1, 6, 4, 5, 3, 2];

function te<T extends Record<string, string>>(map: T, key?: string): string {
  return (key && map[key]) || "";
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TZ });
}

export interface TodayPanchangam {
  date: string;
  varam: string;
  teluguMonth: string;
  tithi: string;
  paksha: string;
  nakshatra: string;
  yoga: string;
  karana: string;
  sunrise: string;
  sunset: string;
  rahuKalam: string;
}

export function computePanchangam(now: Date): TodayPanchangam {
  const obj = new MhahPanchang();
  const { sunrise, sunset } = SunCalc.getTimes(now, LAT, LON);

  // Panchang elements are reckoned at sunrise.
  const at = sunrise && !isNaN(sunrise.getTime()) ? sunrise : now;
  const c = obj.calculate(at);
  const cal = obj.calendar(at, LAT, LON);

  let rahuKalam = "";
  if (sunrise && sunset && !isNaN(sunrise.getTime()) && !isNaN(sunset.getTime())) {
    const seg = (sunset.getTime() - sunrise.getTime()) / 8;
    const idx = RAHU_SEGMENT[now.getDay()];
    const start = new Date(sunrise.getTime() + idx * seg);
    const end = new Date(start.getTime() + seg);
    rahuKalam = `${fmtTime(start)} - ${fmtTime(end)}`;
  }

  return {
    date: now.toLocaleDateString("te-IN", { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: TZ }),
    varam: VAARA_TE[now.getDay()],
    teluguMonth: te(MASA_TE, cal.Masa?.name_en_IN) + (te(MASA_TE, cal.Masa?.name_en_IN) ? " మాసం" : ""),
    tithi: te(TITHI_TE, c.Tithi?.name_en_IN),
    paksha: te(PAKSHA_TE, c.Paksha?.name_en_IN),
    nakshatra: te(NAKSHATRA_TE, c.Nakshatra?.name_en_IN),
    yoga: te(YOGA_TE, c.Yoga?.name_en_IN),
    karana: te(KARANA_TE, c.Karna?.name_en_IN),
    sunrise: sunrise && !isNaN(sunrise.getTime()) ? fmtTime(sunrise) : "",
    sunset: sunset && !isNaN(sunset.getTime()) ? fmtTime(sunset) : "",
    rahuKalam,
  };
}

// ---- Curated festivals + holidays (2026) ----
//
// EDITORIAL NOTE: fixed-date national/state holidays are exact. Lunar/Islamic
// festival dates (marked ~) are best-effort for 2026 and should be verified
// against the official AP government holiday gazette by the desk - the page
// reads straight from this list, so correcting a date here updates the site.

type Fest = { m: number; d: number; te: string; en: string; type: "festival" | "holiday" };

const FESTIVALS_2026: Fest[] = [
  { m: 1, d: 1, te: "నూతన సంవత్సరం", en: "New Year", type: "holiday" },
  { m: 1, d: 13, te: "భోగి", en: "Bhogi", type: "festival" },
  { m: 1, d: 14, te: "మకర సంక్రాంతి", en: "Makara Sankranti", type: "festival" },
  { m: 1, d: 15, te: "కనుమ", en: "Kanuma", type: "festival" },
  { m: 1, d: 26, te: "గణతంత్ర దినోత్సవం", en: "Republic Day", type: "holiday" },
  { m: 2, d: 15, te: "మహా శివరాత్రి", en: "Maha Shivaratri", type: "festival" },
  { m: 3, d: 3, te: "హోళీ", en: "Holi", type: "festival" },
  { m: 3, d: 19, te: "ఉగాది", en: "Ugadi (Telugu New Year)", type: "festival" },
  { m: 3, d: 26, te: "శ్రీరామ నవమి", en: "Sri Rama Navami", type: "festival" },
  { m: 4, d: 3, te: "గుడ్ ఫ్రైడే", en: "Good Friday", type: "holiday" },
  { m: 4, d: 14, te: "అంబేద్కర్ జయంతి", en: "Ambedkar Jayanti", type: "holiday" },
  { m: 5, d: 1, te: "కార్మిక దినోత్సవం", en: "May Day", type: "holiday" },
  { m: 6, d: 26, te: "మొహర్రం", en: "Muharram", type: "holiday" },
  { m: 8, d: 15, te: "స్వాతంత్ర్య దినోత్సవం", en: "Independence Day", type: "holiday" },
  { m: 8, d: 26, te: "వరలక్ష్మి వ్రతం", en: "Varalakshmi Vratam", type: "festival" },
  { m: 8, d: 28, te: "రాఖీ పౌర్ణమి", en: "Raksha Bandhan", type: "festival" },
  { m: 9, d: 4, te: "శ్రీకృష్ణ జన్మాష్టమి", en: "Krishna Janmashtami", type: "festival" },
  { m: 9, d: 14, te: "వినాయక చవితి", en: "Vinayaka Chavithi", type: "festival" },
  { m: 10, d: 2, te: "గాంధీ జయంతి", en: "Gandhi Jayanti", type: "holiday" },
  { m: 10, d: 20, te: "విజయదశమి (దసరా)", en: "Vijayadashami", type: "festival" },
  { m: 11, d: 8, te: "దీపావళి", en: "Deepavali", type: "festival" },
  { m: 12, d: 25, te: "క్రిస్మస్", en: "Christmas", type: "holiday" },
];

export interface FestivalItem { day: number; name: string; nameEn: string; type: string; month: number }

// Festivals for the current calendar month; if the month has none, fall back to
// the next upcoming festivals so the card is never empty.
export function getFestivals(now: Date): { items: FestivalItem[]; isUpcoming: boolean } {
  const m = now.getMonth() + 1;
  const thisMonth = FESTIVALS_2026.filter((f) => f.m === m);
  if (thisMonth.length) {
    return { items: thisMonth.map((f) => ({ day: f.d, name: f.te, nameEn: f.en, type: f.type, month: f.m })), isUpcoming: false };
  }
  const d = now.getDate();
  const upcoming = FESTIVALS_2026
    .filter((f) => f.m > m || (f.m === m && f.d >= d))
    .slice(0, 5)
    .map((f) => ({ day: f.d, name: f.te, nameEn: f.en, type: f.type, month: f.m }));
  return { items: upcoming, isUpcoming: true };
}

// ---- Shubha muhurthams (derived) ----
//
// A day is treated as auspicious when the sunrise nakshatra is in the classic
// "shubha" set AND the tithi is not a rejected one (Amavasya / Chaturthi /
// Navami / Chaturdasi). This is a simplified, general-purpose muhurtham - not a
// type-specific (wedding vs griha-pravesam) reckoning.

const AUSPICIOUS_NAK = new Set([
  "Ashwini", "Rohini", "Mrigashirsha", "Punarvasu", "Pushya", "Uttara Phalguni",
  "Hasta", "Chitra", "Swati", "Anuradha", "Uttara Ashadha", "Sravana",
  "Dhanishta", "Shatabhisha", "Uttara Bhadrapada", "Rebati",
]);
const REJECTED_TITHI = new Set(["Amavasya", "Chavithi", "Chaviti", "Navami", "Chaturdasi"]);

export interface MuhurthamDate { day: number; date: string; nakshatra: string }

export function computeMuhurthams(now: Date): { name: string; nameEn: string; dates: MuhurthamDate[] }[] {
  const obj = new MhahPanchang();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = now.getDate();
  const dates: MuhurthamDate[] = [];

  for (let day = startDay; day <= daysInMonth; day++) {
    const d = new Date(year, month, day, 8, 0, 0);
    const { sunrise } = SunCalc.getTimes(d, LAT, LON);
    const at = sunrise && !isNaN(sunrise.getTime()) ? sunrise : d;
    const c = obj.calculate(at);
    const nak = c.Nakshatra?.name_en_IN;
    const tit = c.Tithi?.name_en_IN;
    if (nak && AUSPICIOUS_NAK.has(nak) && tit && !REJECTED_TITHI.has(tit)) {
      dates.push({
        day,
        date: `${day}`,
        nakshatra: te(NAKSHATRA_TE, nak),
      });
    }
    if (dates.length >= 12) break;
  }

  if (!dates.length) return [];
  return [{ name: "శుభ ముహూర్తాలు", nameEn: "Auspicious days", dates }];
}
