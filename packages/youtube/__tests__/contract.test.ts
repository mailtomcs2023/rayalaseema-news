import { describe, test, expect } from "bun:test";
import { suggestionsSchema } from "../src/contract";

// A valid model response, shared by the admin tests that fake the model.
export const SAMPLE = {
  format: "VIDEO",
  summary_te: "ప్రొద్దుటూరు మున్సిపల్ ఎన్నికలపై రాచమల్లు ఫైర్.",
  summary_en: "Rachamallu Siva Prasad Reddy slams Varadarajulu Reddy in Proddatur.",
  titles: [
    { text: "వరదరాజుల రెడ్డిపై రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy vs Varadarajulu Reddy", why: "names" },
    { text: "ఏకగ్రీవాలపై రాచమల్లు హెచ్చరిక | Proddatur Municipal Elections Rachamallu", why: "place" },
    { text: "ప్రొద్దుటూరులో రాజకీయ వేడి | Proddatur News Today Rachamallu", why: "keyword" },
  ],
  description: "desc",
  tags: ["proddatur news", "ప్రొద్దుటూరు న్యూస్", "rachamallu siva prasad reddy", "kadapa news", "రాచమల్లు"],
  hashtags: [],
  chapters: [
    { start: "00:00", title_te: "పరిచయం" },
    { start: "01:10", title_te: "ఆరోపణలు" },
    { start: "05:00", title_te: "హెచ్చరిక" },
  ],
  pinned_comment: "మీ అభిప్రాయం?",
  playlists: ["Politics", "District Stories"],
  thumbnail: { headline_te: "ఏకగ్రీవాలపై రాచమల్లు ఫైర్", concept: "face + burning papers" },
  entities: { people: ["Rachamallu Siva Prasad Reddy"], places: ["Proddatur"], parties: ["YSRCP", "TDP"], topics: ["municipal elections"] },
  fit: { district: "Kadapa", local_relevance: 0.95, reused_content_risk: "low", verdict: "fit", reason_te: "" },
  low_confidence: false,
};

describe("suggestionsSchema", () => {
  test("accepts the sample", () => {
    const r = suggestionsSchema.safeParse(SAMPLE);
    expect(r.success).toBe(true);
  });
  test("rejects a title over 100 chars", () => {
    expect(suggestionsSchema.safeParse({ ...SAMPLE, titles: [{ text: "x".repeat(101), why: "" }, SAMPLE.titles[1], SAMPLE.titles[2]] }).success).toBe(false);
  });
  test("rejects an unknown fit verdict", () => {
    expect(suggestionsSchema.safeParse({ ...SAMPLE, fit: { ...SAMPLE.fit, verdict: "maybe" } }).success).toBe(false);
  });
  test("requires exactly three titles", () => {
    expect(suggestionsSchema.safeParse({ ...SAMPLE, titles: SAMPLE.titles.slice(0, 2) }).success).toBe(false);
  });
  test("rejects a URL inside the pinned comment", () => {
    expect(suggestionsSchema.safeParse({ ...SAMPLE, pinned_comment: "see https://x.y" }).success).toBe(false);
  });
});
