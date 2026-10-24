import { describe, test, expect } from "bun:test";
import { scoresFor, titleContext } from "../../src/lib/video-iq/scores";
import { scoreDescription, scoreTags } from "@rayalaseema/youtube";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

// Stored suggestions as the worker leaves them: keywords priced, fit capped
// by high reuse risk.
const s: any = {
  ...SAMPLE,
  format: "VIDEO",
  keywords: { terms: [{ term: "proddatur news", volume: 1000, competition: "LOW" }], suggested: [], serp: [] },
  fit: { ...SAMPLE.fit, local_relevance: 1, reused_content_risk: "high", verdict: "fit" },
};
const chosen: any = {
  title: "రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy Proddatur News",
  thumbnailIndex: 0, thumbnailUrl: "https://blob/t.jpg",
  description: "హుక్ లైన్\nకథ వివరాలు ఇక్కడ ఉంటాయి, రెండు మూడు వాక్యాలు, ఎనభై అక్షరాలకు పైగా ఉండేలా రాయాలి.",
  tags: SAMPLE.tags, chapters: [], hashtags: [], playlists: [], comment: "",
};

describe("scoresFor (the scorecard follows the editor's current choice)", () => {
  test("scores the chosen title, description and tags; keeps the thumbnail score it is given", () => {
    const r = scoresFor(s, chosen, { thumbnail: 67, breaking: false });
    expect(r.title).toBe(100);
    expect(r.thumbnail).toBe(67);
    expect(r.description).toBe(scoreDescription(chosen.description));
    expect(r.tags).toBe(scoreTags(chosen.tags));
    expect(r.fit).toBe(40);
    expect(r.overall).toBeGreaterThan(0);
  });
  test("a weaker title lowers the title score and the overall", () => {
    const good = scoresFor(s, chosen, { thumbnail: 100, breaking: false });
    const weak = scoresFor(s, { ...chosen, title: "ఘటన | Evening Update" }, { thumbnail: 100, breaking: false });
    expect(weak.title).toBeLessThan(good.title);
    expect(weak.overall).toBeLessThan(good.overall);
  });
  test("an admin 'original footage' override lifts the fit cap", () => {
    const r = scoresFor(s, { ...chosen, override: { note: "our own camera", by: "u1", at: "2026-10-24T00:00:00Z", originalFootage: true } }, { thumbnail: 100, breaking: false });
    expect(r.fit).toBe(100);
  });
  test("titleContext builds the volume map from the stored keywords", () => {
    const ctx = titleContext(s, false);
    expect(ctx.volumes.get("proddatur news")).toBe(1000);
    expect(ctx.entities.places).toContain("Proddatur");
  });
});
