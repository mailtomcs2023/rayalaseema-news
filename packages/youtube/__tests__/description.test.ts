import { describe, test, expect } from "bun:test";
import { buildDescription, placeLine } from "../src/description";
import { PLACES } from "../src/places";

const SITE = "https://rayalaseemanews.com";
const SUB = "https://www.youtube.com/@rayalaseemanewstv?sub_confirmation=1";

describe("buildDescription", () => {
  test("assembles hook, english line, link, place line, story, hashtags, footer", () => {
    const d = buildDescription({
      hook: "హుక్", enLine: "English line", articleUrl: "https://rayalaseemanews.com/videos/x",
      placeLine: "Proddatur News | ప్రొద్దుటూరు న్యూస్", story: "కథ", hashtags: ["#ProddaturNews"], site: SITE, subscribeUrl: SUB,
    });
    const lines = d.split("\n");
    expect(lines[0]).toBe("హుక్");
    expect(lines[1]).toBe("English line");
    expect(d).toContain("పూర్తి వార్త: https://rayalaseemanews.com/videos/x");
    expect(d.indexOf("కథ")).toBeGreaterThan(d.indexOf("Proddatur News"));
    expect(d).toContain("#ProddaturNews");
    expect(d.endsWith("sub_confirmation=1")).toBe(true);
    expect(d).not.toMatch(/\n{3,}/);
  });
  test("optional parts are simply absent", () => {
    const d = buildDescription({ hook: "హుక్", site: SITE, subscribeUrl: SUB });
    expect(d).not.toContain("పూర్తి వార్త");
    expect(d.split("\n")[0]).toBe("హుక్");
    expect(d).toContain(SITE);
  });
});

describe("placeLine", () => {
  test("town includes its district; today flag adds Today", () => {
    expect(placeLine(PLACES.find((p) => p.en === "Proddatur")!, true)).toBe("Proddatur News Today | ప్రొద్దుటూరు న్యూస్ | Kadapa District News | Rayalaseema News");
  });
  test("district HQ has no district repeat", () => {
    expect(placeLine(PLACES.find((p) => p.en === "Kadapa")!, false)).toBe("Kadapa News | కడప న్యూస్ | Rayalaseema News");
  });
  test("null place gives null", () => expect(placeLine(null, false)).toBeNull());
});
