import { describe, test, expect } from "bun:test";
import { scoreTitle, scoreDescription, scoreTags, scoreThumbnail, scoreFit, overall } from "../src/score";

const ents = { people: ["Rachamallu Siva Prasad Reddy"], places: ["Proddatur"], parties: [], topics: [] };
const vols = new Map<string, number | null>([["proddatur news", 1000]]);
const base = { entities: ents, breaking: false, volumes: vols };

describe("scoreTitle", () => {
  test("good bilingual title with a name and a priced keyword scores 90+", () => {
    expect(scoreTitle("రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy Proddatur News", base)).toBeGreaterThanOrEqual(90);
  });
  test("telugu-only title loses the english and entity points", () => {
    expect(scoreTitle("కడపలో దారుణం", base)).toBeLessThanOrEqual(55);
  });
  test("over-long title scores below the same title trimmed to length", () => {
    const long = scoreTitle("అ".repeat(95) + " | Proddatur", base);
    const fits = scoreTitle("అ".repeat(80) + " | Proddatur", base);
    expect(long).toBeLessThan(fits);
    expect(fits - long).toBeGreaterThanOrEqual(20); // the length penalty, whatever the search-term points
  });
  test("breaking in a non-breaking item costs points", () => {
    const withBreaking = scoreTitle("బ్రేకింగ్ | Proddatur News", base);
    const without = scoreTitle("రాచమల్లు | Proddatur News", base);
    expect(withBreaking).toBeLessThan(without);
  });
});

describe("other scores", () => {
  test("description: hook first, a real story body, no social links", () => {
    const good = "కడప జిల్లా ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై రాళ్ల దాడి కలకలం.\nఅర్ధరాత్రి జరిగిన ఈ దాడి వెనుక ఎమ్మెల్యే అనుచరులు ఉన్నారని ప్రత్యర్థులు ఆరోపిస్తున్నారు. పోలీసులు దర్యాప్తు చేపట్టారు.";
    expect(scoreDescription(good)).toBe(100);
    expect(scoreDescription("హుక్ మాత్రమే")).toBe(75); // a hook alone is not a description
    expect(scoreDescription("https://instagram.com/x\nnothing")).toBeLessThanOrEqual(50);
  });
  test("tags: 15 to 25 mixed-script tags under 450 chars", () => {
    expect(scoreTags(Array.from({ length: 16 }, (_, i) => (i % 2 ? `tag${i}` : `ట్యాగ్${i}`)))).toBe(100);
    expect(scoreTags(["a", "b"])).toBeLessThanOrEqual(75);
  });
  test("thumbnail: short headline, rendered frame, right size", () => {
    expect(scoreThumbnail({ headline: "ఏకగ్రీవాలపై రాచమల్లు ఫైర్", hasFrame: true, bytes: 500_000, width: 1280, height: 720 })).toBe(100);
    expect(scoreThumbnail({ headline: "ఒకటి రెండు మూడు నాలుగు ఐదు ఆరు", hasFrame: false })).toBeLessThanOrEqual(34);
  });
  test("fit: high reuse risk caps at 40", () => {
    expect(scoreFit({ district: "Kadapa", local_relevance: 0.9, reused_content_risk: "high", verdict: "borderline", reason_te: "" })).toBe(40);
    expect(scoreFit({ district: "Kadapa", local_relevance: 0.9, reused_content_risk: "low", verdict: "fit", reason_te: "" })).toBe(90);
  });
  test("overall is the weighted blend", () => {
    expect(overall({ title: 100, thumbnail: 100, description: 100, tags: 100, fit: 100 })).toBe(100);
    expect(overall({ title: 0, thumbnail: 100, description: 100, tags: 100, fit: 100 })).toBe(65);
  });
});

// Owner report 2026-10-24: AI titles carrying "Dharmavaram" / "కేతిరెడ్డికి" were
// told "no person or place name from the story" because the check was a plain
// substring match on the Telugu entity strings.
describe("scoreTitle names in either script", () => {
  const te = { people: ["కేతిరెడ్డి వెంకట్రామిరెడ్డి", "సీఐ ప్రభాకర్"], places: ["శ్రీ సత్యసాయి జిల్లా", "ధర్మవరం"], parties: ["వైసీపీ"], topics: [] };
  const none = new Map<string, number | null>();
  test("an inflected Telugu name counts (కేతిరెడ్డికి ← కేతిరెడ్డి)", () => {
    expect(scoreTitle("కేతిరెడ్డికి సీఐ బహిరంగ సవాల్ | Ex MLA Row", { entities: te, breaking: false, volumes: none })).toBeGreaterThanOrEqual(85);
  });
  test("the English spelling of a Telugu place entity counts and earns the search-term points (ధర్మవరం → Dharmavaram)", () => {
    expect(scoreTitle("లంచం నిరూపించు.. లేదంటే కేసులు! | Dharmavaram CI Challenge", { entities: te, breaking: false, volumes: none })).toBe(100);
  });
  test("generic words shared with an entity (జిల్లా, CI) do not count as a name", () => {
    expect(scoreTitle("జిల్లాలో ఘటన | CI Warning Today", { entities: te, breaking: false, volumes: none })).toBeLessThanOrEqual(65);
  });
  test("a known person in the English half counts when the entity is the Telugu form", () => {
    expect(scoreTitle("సీఐ సవాల్ | Kethireddy Venkatarami Reddy Row", { entities: te, breaking: false, volumes: none })).toBe(100);
  });
  test("without volumes, only a known place or person in the English half earns the search-term points", () => {
    const unpriced = new Map<string, number | null>([["dharmavaram", null], ["ex mla row today", null]]);
    expect(scoreTitle("కేతిరెడ్డికి సవాల్ | Dharmavaram Ex MLA Row", { entities: te, breaking: false, volumes: unpriced })).toBe(100);
    expect(scoreTitle("కేతిరెడ్డికి సవాల్ | Ex MLA Row Today", { entities: te, breaking: false, volumes: unpriced })).toBe(85);
  });
  test("a priced term still wins the points once volumes exist", () => {
    const priced = new Map<string, number | null>([["ci challenge", 1000]]);
    expect(scoreTitle("కేతిరెడ్డికి సవాల్ | CI Challenge Row", { entities: te, breaking: false, volumes: priced })).toBe(100);
  });
});

describe("scoreFit with an admin override", () => {
  const f = { verdict: "fit" as const, district: "Sri Sathya Sai", local_relevance: 1, reused_content_risk: "high" as const, reason_te: "" };
  test("high reuse risk caps fit at 40", () => expect(scoreFit(f)).toBe(40));
  test("'original footage' override lifts the cap", () => expect(scoreFit(f, { originalFootage: true })).toBe(100));
  test("the override does not invent relevance", () => expect(scoreFit({ ...f, local_relevance: 0.6 }, { originalFootage: true })).toBe(60));
});
