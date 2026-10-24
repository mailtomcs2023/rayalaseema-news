import { describe, test, expect } from "bun:test";
import { regenerateField, buildRegenerateMessages } from "../../src/lib/video-iq/regenerate";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

const run: any = {
  id: "r1", deskTitle: "ప్రొద్దుటూరులో దాడి", deskNotes: "", breaking: false, district: "Kadapa",
  transcript: { locale: "te-IN", durationSec: 60, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై" }], words: 30 },
  suggestions: { ...SAMPLE, format: "VIDEO", keywords: { terms: [{ term: "proddatur news", volume: 1000, competition: "LOW" }], suggested: [], serp: [] } },
  chosen: { title: "కడపలో దారుణం", description: "https://instagram.com/x\nnothing", tags: ["a", "b"], chapters: [], hashtags: [], playlists: [], comment: "" },
};

describe("buildRegenerateMessages", () => {
  test("tells the model the field, the current value, why it scored low, and the editor's instruction; never a URL", () => {
    const msgs = buildRegenerateMessages({ field: "title", run, current: "కడపలో దారుణం", instruction: "mention Varadarajulu Reddy" });
    const all = msgs.map((m) => m.content).join("\n");
    expect(all).toContain("కడపలో దారుణం");
    expect(all).toContain("no English headline");
    expect(all).toContain("mention Varadarajulu Reddy");
    expect(all).toContain("proddatur news");
    expect(all).not.toMatch(/https?:\/\//);
  });
});

describe("regenerateField", () => {
  test("title: returns three validated, scored candidates, trimmed to 100 chars", async () => {
    const chatJson = (async () => ({ titles: [{ text: `${"అ".repeat(95)} | Rachamallu Siva Prasad Reddy Proddatur News`, why: "long" }, { text: "వరదరాజుల రెడ్డిపై రాచమల్లు ఫైర్ | Rachamallu vs Varadarajulu Reddy Proddatur", why: "" }, { text: "x", why: "" }] })) as any;
    const r = await regenerateField({ field: "title", run, current: "కడపలో దారుణం" }, { chatJson });
    expect(r.candidates.length).toBe(2); // "x" is dropped (too short)
    expect(r.candidates.every((c) => [...c.value].length <= 100)).toBe(true);
    expect(r.candidates[0].score).toBeGreaterThan(0);
    expect(Array.isArray(r.candidates[0].reasons)).toBe(true);
  });
  test("description: hook first, no URLs, scored with reasons", async () => {
    const chatJson = (async () => ({ description: "ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై రాళ్ల దాడి.\nవివరాలు https://x.y\nకడప జిల్లా ప్రొద్దుటూరులో అర్ధరాత్రి జరిగిన ఈ దాడి వెనుక ఎమ్మెల్యే అనుచరులు ఉన్నారని ప్రత్యర్థులు ఆరోపిస్తున్నారు. పోలీసులు దర్యాప్తు చేపట్టారు." })) as any;
    const r = await regenerateField({ field: "description", run, current: "old" }, { chatJson });
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].value).not.toMatch(/https?:\/\//);
    expect(r.candidates[0].value.split("\n")[0]).toBe("ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై రాళ్ల దాడి.");
    expect(r.candidates[0].score).toBe(100);
  });
  test("tags: merged, deduplicated, capped at 25 (the rubric's ceiling)", async () => {
    const chatJson = (async () => ({ tags: Array.from({ length: 40 }, (_, i) => (i % 2 ? `tag${i}` : `ట్యాగ్${i}`)).concat(["a"]) })) as any;
    const r = await regenerateField({ field: "tags", run, current: ["a", "b"] }, { chatJson });
    const tags = r.candidates[0].value as string[];
    expect(tags.length).toBe(25);
    expect(new Set(tags).size).toBe(25);
    expect(tags.slice(0, 2)).toEqual(["a", "b"]); // the editor's own tags stay first
    expect(r.candidates[0].score).toBe(100);
  });
  test("comment: no URLs, 500 chars max", async () => {
    const chatJson = (async () => ({ comment: "మీ అభిప్రాయం? https://x.y " + "అ".repeat(600) })) as any;
    const r = await regenerateField({ field: "comment", run, current: "" }, { chatJson });
    expect(r.candidates[0].value).not.toMatch(/https?:\/\//);
    expect([...(r.candidates[0].value as string)].length).toBeLessThanOrEqual(500);
  });
  test("chapters: validated shape, first at 00:00", async () => {
    const chatJson = (async () => ({ chapters: [{ start: "00:05", title_te: "ఒకటి" }, { start: "00:40", title_te: "రెండు" }] })) as any;
    const r = await regenerateField({ field: "chapters", run, current: [] }, { chatJson });
    const ch = r.candidates[0].value as Array<{ start: string; title_te: string }>;
    expect(ch[0].start).toBe("00:00");
    expect(ch.length).toBe(2);
  });
  test("garbage model output throws a readable error", async () => {
    const chatJson = (async () => ({ nope: 1 })) as any;
    await expect(regenerateField({ field: "title", run, current: "x" }, { chatJson })).rejects.toThrow(/model output invalid/);
  });
});
