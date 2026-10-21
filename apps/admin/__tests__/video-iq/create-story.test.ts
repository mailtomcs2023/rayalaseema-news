import { describe, test, expect } from "bun:test";
import { storyDraftFrom, titlePatterns, isLiveTitle } from "../../src/lib/video-iq/story-draft";

describe("titlePatterns", () => {
  test("finds phrases shared by two or more titles, longest and most common first", () => {
    const p = titlePatterns([
      "Rachamallu Siva Prasad Reddy Shocking Comments On Varadarajulu",
      "రాచమల్లు స్ట్రాంగ్ వార్నింగ్ | Rachamallu Siva Prasad Reddy",
      "High Tension in Proddatur | Rachamallu Siva Prasad Reddy",
    ]);
    expect(p[0]).toBe("rachamallu siva prasad reddy");
  });
  test("single title has no patterns", () => {
    expect(titlePatterns(["only one"])).toEqual([]);
  });
});

describe("storyDraftFrom", () => {
  test("draft carries town, topic, winning patterns and the own-footage rule without any URL", () => {
    const d = storyDraftFrom(
      { title: "Rachamallu Protest At Proddatur Municipal Office", towns: ["Proddatur"], topicKey: "proddatur+rachamallu siva prasad reddy" },
      { titles: ["Rachamallu Protest At Proddatur Municipal Office", "Proddatur Municipal Office Protest By Rachamallu Siva Prasad Reddy"] },
    );
    expect(d.title).toContain("Proddatur");
    expect(d.editorNote).toMatch(/own footage/i);
    expect(d.editorNote).toContain("proddatur+rachamallu siva prasad reddy");
    expect(d.editorNote).toMatch(/patterns/i);
    expect(d.editorNote).not.toMatch(/https?:\/\//);
  });
  test("no cluster still produces a usable draft", () => {
    const d = storyDraftFrom({ title: "Kurnool Bus Accident", towns: [], topicKey: null }, null);
    expect(d.title).toContain("Kurnool Bus Accident");
    expect(d.editorNote).toMatch(/own footage/i);
  });
});

describe("isLiveTitle", () => {
  test("LIVE prefixes, suffixes and 🔴 live markers are live streams", () => {
    expect(isLiveTitle("LIVE: వైసీపీకి బిగ్ రిలీఫ్")).toBe(true);
    expect(isLiveTitle("🔴LIVE | TV9 Telugu")).toBe(true);
    expect(isLiveTitle("నామినేషన్ల వేళ పుంగనూరులో రణరంగం : 🔴 LIVE")).toBe(true);
    expect(isLiveTitle("Rachamallu live reaction video")).toBe(false);
  });
  test("story draft strips the live marker from the lead", () => {
    const d = storyDraftFrom({ title: "నామినేషన్ల వేళ పుంగనూరులో రణరంగం : 🔴 LIVE", towns: ["Punganur"], topicKey: null }, null);
    expect(d.title).toBe("Punganur: నామినేషన్ల వేళ పుంగనూరులో రణరంగం");
  });
});
