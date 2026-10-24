import { describe, test, expect } from "bun:test";
import { analyzeVideo, buildMessages } from "../../src/lib/video-iq/analyze";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

const input = {
  format: "VIDEO" as const,
  transcript: { locale: "te-IN", durationSec: 600, segments: [{ start: 0, end: 5, text: "రాచమల్లు ఫైర్ వరదరాజుల రెడ్డిపై ప్రొద్దుటూరు మున్సిపల్ ఎన్నికల ఏకగ్రీవాలపై" }], words: 40 },
  deskTitle: "రాచమల్లు ప్రెస్ మీట్",
  deskDescription: "",
  district: "Kadapa",
  keywordTerms: ["proddatur news"],
  playlists: ["Politics", "District Stories", "Shorts"],
  dateDdMmYyyy: "20-10-2026",
  breaking: false,
};

describe("analyzeVideo", () => {
  test("prompt carries transcript, rules, playlists, keywords, and no URLs", () => {
    const msgs = buildMessages(input);
    const all = msgs.map((m) => m.content).join("\n");
    expect(msgs[0].role).toBe("system");
    expect(all).toContain("రాచమల్లు ఫైర్");
    expect(all).toContain("Politics");
    expect(all).toContain("proddatur news");
    expect(all).toContain("100");
    expect(all).not.toMatch(/https?:\/\//);
  });

  test("returns validated suggestions from the model JSON", async () => {
    const chatJson = (async () => SAMPLE) as any;
    const s = await analyzeVideo(input, { chatJson });
    expect(s.titles.length).toBe(3);
    expect(s.fit.verdict).toBe("fit");
    expect(s.low_confidence).toBe(false);
  });

  test("never sends a temperature (gpt-5.5 rejects anything but the default) and uses the Video IQ deployment", async () => {
    process.env.AZURE_OPENAI_VIDEOIQ_DEPLOYMENT = "gpt55";
    let seen: any = null;
    const chatJson = (async (opts: any) => { seen = opts; return SAMPLE; }) as any;
    await analyzeVideo(input, { chatJson });
    expect(seen.deployment).toBe("gpt55");
    expect(seen.temperature).toBeNull(); // the client omits the field for null
    delete process.env.AZURE_OPENAI_VIDEOIQ_DEPLOYMENT;
  });

  test("short transcript forces low_confidence and still yields titles", async () => {
    const chatJson = (async () => ({ ...SAMPLE, low_confidence: false })) as any;
    const thin = { locale: "te-IN", durationSec: 30, segments: [{ start: 0, end: 2, text: "సంగీతం" }], words: 1 };
    const s = await analyzeVideo({ ...input, transcript: thin }, { chatJson });
    expect(s.low_confidence).toBe(true);
    expect(s.titles.length).toBe(3);
  });

  test("format in the result follows the probe, not the model", async () => {
    const chatJson = (async () => ({ ...SAMPLE, format: "SHORT" })) as any;
    const s = await analyzeVideo(input, { chatJson });
    expect(s.format).toBe("VIDEO");
  });

  test("over-long titles are trimmed to 100 chars keeping the English half; over-long lists are clamped", async () => {
    const longHook = "అ".repeat(95);
    const chatJson = (async () => ({
      ...SAMPLE,
      titles: [{ text: `${longHook} | Proddatur News Today Rachamallu`, why: "" }, SAMPLE.titles[1], SAMPLE.titles[2]],
      tags: Array.from({ length: 40 }, (_, i) => `tag${i}`),
      hashtags: ["#a", "#b", "#c", "#d", "#e", "#f", "#g"],
    })) as any;
    const s = await analyzeVideo(input, { chatJson });
    expect([...s.titles[0].text].length).toBeLessThanOrEqual(100);
    expect(s.titles[0].text.endsWith("| Proddatur News Today Rachamallu")).toBe(true);
    expect(s.tags.length).toBe(30);
    expect(s.hashtags.length).toBe(5);
  });

  test("invalid model output throws a readable error", async () => {
    const chatJson = (async () => ({ nope: 1 })) as any;
    await expect(analyzeVideo(input, { chatJson })).rejects.toThrow(/model output invalid/);
  });
});
