import { describe, test, expect } from "bun:test";
import { chosenSchema, finalizeChosen } from "../../src/lib/video-iq/chosen";
import { PLACES } from "@rayalaseema/youtube";

const base = {
  title: "రాచమల్లు ఫైర్ | Rachamallu Siva Prasad Reddy Proddatur",
  thumbnailIndex: 0,
  thumbnailUrl: "https://blob/t.jpg",
  description: "హుక్\n\nకథ",
  tags: ["a", "b", "c", "d", "e"],
  chapters: [],
  hashtags: [],
  playlists: ["Politics"],
  comment: "మీ అభిప్రాయం?",
};

describe("chosenSchema", () => {
  test("accepts a valid choice", () => {
    expect(chosenSchema.safeParse(base).success).toBe(true);
  });
  test("an admin override may record that the footage is the channel's own", () => {
    const r = chosenSchema.safeParse({ ...base, override: { note: "our own camera team shot it", by: "u1", at: "2026-10-24T00:00:00Z", originalFootage: true } });
    expect(r.success).toBe(true);
    expect(r.success && r.data.override?.originalFootage).toBe(true);
  });
  test("rejects a URL in the comment", () => {
    expect(chosenSchema.safeParse({ ...base, comment: "see https://x.y" }).success).toBe(false);
  });
  test("rejects a title without the hook | english separator", () => {
    expect(chosenSchema.safeParse({ ...base, title: "రాచమల్లు ఫైర్" }).success).toBe(false);
  });
  test("rejects more than three playlists and unknown keys", () => {
    expect(chosenSchema.safeParse({ ...base, playlists: ["a", "b", "c", "d"] }).success).toBe(false);
    expect(chosenSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});

describe("finalizeChosen", () => {
  const row = { suggestions: { summary_en: "EN summary" } } as any;
  test("appends link, place line, chapters and footer once", () => {
    const c = finalizeChosen(row, chosenSchema.parse({ ...base, chapters: [{ start: "00:00", title_te: "పరిచయం" }, { start: "01:10", title_te: "ఆరోపణలు" }] }), {
      url: "https://rayalaseemanews.com/videos/x",
      place: PLACES.find((p) => p.en === "Proddatur")!,
      today: true,
    });
    expect(c.description.split("\n")[0]).toBe("హుక్");
    expect(c.description).toContain("EN summary");
    expect(c.description).toContain("పూర్తి వార్త: https://rayalaseemanews.com/videos/x");
    expect(c.description).toContain("Proddatur News Today");
    expect(c.description).toContain("00:00 పరిచయం\n01:10 ఆరోపణలు");
    expect((c.description.match(/sub_confirmation=1/g) ?? []).length).toBe(1);
    expect(c.title).toBe(base.title);
  });
  test("re-finalizing an already finalized description does not duplicate the footer or link", () => {
    const once = finalizeChosen(row, chosenSchema.parse(base), { url: "https://rayalaseemanews.com/videos/x", place: null, today: false });
    const twice = finalizeChosen(row, { ...once }, { url: "https://rayalaseemanews.com/videos/x", place: null, today: false });
    expect(twice.description).toBe(once.description);
  });
  test("no article url and no place leaves those lines out", () => {
    const c = finalizeChosen(row, chosenSchema.parse(base), { url: null, place: null, today: false });
    expect(c.description).not.toContain("పూర్తి వార్త");
    expect(c.description).not.toContain(" News | ");
    expect(c.description).toContain("rayalaseemanews.com");
  });
});
