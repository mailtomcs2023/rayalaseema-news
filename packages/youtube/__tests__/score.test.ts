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
    expect(long).toBeLessThan(80);
  });
  test("breaking in a non-breaking item costs points", () => {
    const withBreaking = scoreTitle("బ్రేకింగ్ | Proddatur News", base);
    const without = scoreTitle("రాచమల్లు | Proddatur News", base);
    expect(withBreaking).toBeLessThan(without);
  });
});

describe("other scores", () => {
  test("description: hook first, place line present, no social links", () => {
    expect(scoreDescription("hook line\nProddatur News | ప్రొద్దుటూరు న్యూస్\nbody")).toBe(100);
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
