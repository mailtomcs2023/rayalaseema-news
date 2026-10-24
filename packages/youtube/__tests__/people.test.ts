import { describe, test, expect } from "bun:test";
import { canonicalizeNames, peopleIn } from "../src/people";

describe("people: Kethireddy Venkatarami Reddy (ex-MLA Dharmavaram)", () => {
  test("aliases canonicalise to one English spelling", () => {
    expect(canonicalizeNames("Ketireddy Venkatarami Reddy row")).toBe("Kethireddy Venkatarami Reddy row");
    expect(canonicalizeNames("Kethireddy Venkatrami Reddy row")).toBe("Kethireddy Venkatarami Reddy row");
  });
  test("an inflected Telugu mention is found", () => {
    expect(peopleIn("కేతిరెడ్డికి సీఐ బహిరంగ సవాల్").map((p) => p.en)).toContain("Kethireddy Venkatarami Reddy");
  });
});
