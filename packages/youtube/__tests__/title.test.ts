import { describe, test, expect } from "bun:test";
import { splitTitle, joinTitle, titleLength } from "../src/title";
import { canonicalizeNames, peopleIn } from "../src/people";

describe("title", () => {
  test("splits on the last separator so Telugu hooks with | survive", () => {
    const t = "ప్రొద్దుటూరులో దాడి | దర్శిలో కూటమి బోణీ | Speed News 19-10-2026";
    expect(splitTitle(t)).toEqual({ hook: "ప్రొద్దుటూరులో దాడి | దర్శిలో కూటమి బోణీ", english: "Speed News 19-10-2026" });
  });
  test("no separator means english is empty", () => {
    expect(splitTitle("కడపలో దారుణం")).toEqual({ hook: "కడపలో దారుణం", english: "" });
  });
  test("join trims and caps at 100", () => {
    expect(joinTitle(" కడపలో దారుణం ", "Kadapa Axe Murder")).toBe("కడపలో దారుణం | Kadapa Axe Murder");
    expect(titleLength(joinTitle("అ".repeat(90), "Kadapa News"))).toBeLessThanOrEqual(100);
  });
  test("over-long hook is cut at a word boundary, never mid-word", () => {
    const hook = "ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై రాళ్ల దాడి కలకలం సృష్టించింది";
    const t = joinTitle(hook, "Proddatur row on YSRCP candidate, Varadarajulu Reddy heat");
    expect(titleLength(t)).toBeLessThanOrEqual(100);
    expect(t.endsWith(" | Proddatur row on YSRCP candidate, Varadarajulu Reddy heat")).toBe(true);
    const cutHook = t.split(" | ")[0];
    expect(hook.split(" ")).toContain(cutHook.split(" ").pop());
    expect(hook.startsWith(cutHook)).toBe(true);
  });
  test("canonical names fix common variants", () => {
    expect(canonicalizeNames("Rachamallu Shiva Prasad Reddy vs Varadarajula Reddy")).toBe("Rachamallu Siva Prasad Reddy vs Varadarajulu Reddy");
    expect(peopleIn("రాచమల్లు శివప్రసాద్ రెడ్డి ఫైర్").map((p) => p.en)).toEqual(["Rachamallu Siva Prasad Reddy"]);
  });
});
