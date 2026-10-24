import { describe, test, expect } from "bun:test";
import { explainTitle, explainDescription, explainTags } from "../src/explain";

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
    expect(explainTitle("బ్రేకింగ్ | Proddatur 7 PM News", { entities: ents, breaking: false, volumes: new Map() })).toEqual(expect.arrayContaining(["\"breaking\" used on a non-breaking item", "clock time in the title", "no priced search term in the English half"]));
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
