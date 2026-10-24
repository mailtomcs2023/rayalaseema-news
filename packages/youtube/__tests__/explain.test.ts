import { describe, test, expect } from "bun:test";
import { explainTitle, explainDescription, explainTags, explainFit } from "../src/explain";

const ents = { people: ["Rachamallu Siva Prasad Reddy"], places: ["Proddatur"], parties: [], topics: [] };

describe("explainTitle", () => {
  test("a perfect title has no reasons", () => {
    expect(explainTitle("రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy Proddatur News", { entities: ents, breaking: false, volumes: new Map([["proddatur news", 1000]]) })).toEqual([]);
  });
  test("lists every failed check in plain words", () => {
    const r = explainTitle("అ".repeat(101), { entities: ents, breaking: false, volumes: new Map() });
    expect(r).toContain("over 100 characters");
    expect(r).toContain("no English headline after \" | \"");
    expect(r).toContain("no person or place name from the story");
    expect(explainTitle("బ్రేకింగ్ | Evening 7 PM News", { entities: ents, breaking: false, volumes: new Map() })).toEqual(expect.arrayContaining(["\"breaking\" used on a non-breaking item", "clock time in the title", "no search term in the English half: add a priced keyword or a known place or person"]));
  });
});

describe("explainDescription", () => {
  test("flags a URL on the first line, social links and missing hook", () => {
    expect(explainDescription("https://instagram.com/x\nnothing")).toEqual(expect.arrayContaining(["first line must be the Telugu hook, not a link", "social media links in the description"]));
    expect(explainDescription("హుక్\nకథ")).toEqual(["too short: a hook line plus a few story sentences"]);
    expect(explainDescription("కడప జిల్లా ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై రాళ్ల దాడి కలకలం.\nఅర్ధరాత్రి జరిగిన ఈ దాడి వెనుక ఎమ్మెల్యే అనుచరులు ఉన్నారని ప్రత్యర్థులు ఆరోపిస్తున్నారు.")).toEqual([]);
  });
});

describe("explainTags", () => {
  test("flags count, script mix and length", () => {
    expect(explainTags(["a", "b"])).toEqual(expect.arrayContaining(["fewer than 15 tags", "no Telugu-script tags"]));
    expect(explainTags(Array.from({ length: 16 }, (_, i) => (i % 2 ? `tag${i}` : `ట్యాగ్${i}`)))).toEqual([]);
  });
});

describe("explainTitle names in either script", () => {
  const te = { people: ["కేతిరెడ్డి వెంకట్రామిరెడ్డి", "సీఐ ప్రభాకర్"], places: ["శ్రీ సత్యసాయి జిల్లా", "ధర్మవరం"], parties: [], topics: [] };
  test("Telugu inflected name plus the English place spelling pass every check", () => {
    expect(explainTitle("కేతిరెడ్డికి సవాల్ | Dharmavaram Ex MLA Row", { entities: te, breaking: false, volumes: new Map() })).toEqual([]);
  });
  test("a title with neither name nor search term says exactly what is missing", () => {
    expect(explainTitle("సవాల్ విసిరిన సీఐ | Ex MLA Row", { entities: te, breaking: false, volumes: new Map() })).toEqual([
      "no person or place name from the story",
      "no search term in the English half: add a priced keyword or a known place or person",
    ]);
  });
});

describe("explainFit", () => {
  const f = { verdict: "fit" as const, district: "Sri Sathya Sai", local_relevance: 1, reused_content_risk: "high" as const, reason_te: "" };
  test("high reuse risk explains the 40 cap and the way out", () => {
    const r = explainFit(f);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/reuse risk high.*capped at 40/);
    expect(r[0]).toMatch(/original/);
  });
  test("a clean local story has no reasons", () => expect(explainFit({ ...f, reused_content_risk: "low" })).toEqual([]));
  test("partial relevance and not_fit are spelled out", () => {
    expect(explainFit({ ...f, reused_content_risk: "low", local_relevance: 0.6 })).toEqual(["local relevance 60%: only part of the video is about a Rayalaseema district"]);
    expect(explainFit({ ...f, reused_content_risk: "low", verdict: "not_fit" })[0]).toMatch(/not a Rayalaseema story/);
  });
  test("an original-footage override removes the reuse reason", () => expect(explainFit(f, { originalFootage: true })).toEqual([]));
});
