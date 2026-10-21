// Canonical spellings for people who recur in Rayalaseema coverage. Titles,
// tags and topic keys all use `en`; aliases are the variants the desk and
// competitor channels actually type.

export type Person = { en: string; te: string; aliases: string[] };

export const PEOPLE: Person[] = [
  { en: "Rachamallu Siva Prasad Reddy", te: "రాచమల్లు శివప్రసాద్ రెడ్డి", aliases: ["Rachamallu Shiva Prasad Reddy", "Rachamallu Sivaprasad Reddy", "Rachamallu Shivaprasad Reddy", "రాచమల్లు శివప్రసాద్‌రెడ్డి", "రాచమల్లు"] },
  { en: "Varadarajulu Reddy", te: "వరదరాజుల రెడ్డి", aliases: ["Varadarajula Reddy", "Varada Rajulu Reddy", "వరదరాజులురెడ్డి"] },
  { en: "Chandrababu Naidu", te: "చంద్రబాబు నాయుడు", aliases: ["Chandrababu", "CBN", "చంద్రబాబు"] },
  { en: "YS Jagan", te: "వైఎస్ జగన్", aliases: ["Y.S. Jagan", "Jagan Mohan Reddy", "YS Jaganmohan Reddy", "జగన్"] },
  { en: "Pawan Kalyan", te: "పవన్ కళ్యాణ్", aliases: ["Pawan Kalyaan", "పవన్ కల్యాణ్", "పవన్"] },
  { en: "Nara Lokesh", te: "నారా లోకేశ్", aliases: ["Lokesh", "లోకేశ్"] },
  { en: "JC Prabhakar Reddy", te: "జేసీ ప్రభాకర్ రెడ్డి", aliases: ["J.C. Prabhakar Reddy", "JC ప్రభాకర్ రెడ్డి"] },
  { en: "JC Asmith Reddy", te: "జేసీ అస్మిత్ రెడ్డి", aliases: ["JC అస్మిత్ రెడ్డి"] },
  { en: "YS Avinash Reddy", te: "వైఎస్ అవినాష్ రెడ్డి", aliases: ["Avinash Reddy", "అవినాష్ రెడ్డి"] },
  { en: "Bhumana Karunakar Reddy", te: "భూమన కరుణాకర్ రెడ్డి", aliases: ["Bhumana"] },
  { en: "Tulasi Reddy", te: "తులసిరెడ్డి", aliases: ["Tulasireddy", "తులసి రెడ్డి"] },
  { en: "Paka Suresh", te: "పాక సురేష్", aliases: [] },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replace Latin-script aliases with the canonical English name. */
export function canonicalizeNames(text: string): string {
  let out = text;
  for (const p of PEOPLE) {
    for (const a of p.aliases) {
      if (/[A-Za-z]/.test(a)) out = out.replace(new RegExp(`\\b${escapeRe(a)}\\b`, "g"), p.en);
    }
  }
  return out;
}

export function peopleIn(text: string): Person[] {
  return PEOPLE.filter((p) => text.includes(p.te) || text.includes(p.en) || p.aliases.some((a) => text.includes(a)));
}
