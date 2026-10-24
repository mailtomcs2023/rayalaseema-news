import { describe, test, expect } from "bun:test";
import { englishNameOf, nameInTitle, knownNameIn } from "../src/names";

describe("names", () => {
  test("englishNameOf maps Telugu entities to the canonical English spelling", () => {
    expect(englishNameOf("ధర్మవరం")).toBe("Dharmavaram");
    expect(englishNameOf("శ్రీ సత్యసాయి జిల్లా")).toBe("Sri Sathya Sai");
    expect(englishNameOf("కేతిరెడ్డి వెంకట్రామిరెడ్డి")).toBe("Kethireddy Venkatarami Reddy");
    expect(englishNameOf("సీఐ ప్రభాకర్")).toBeNull();
  });
  test("nameInTitle ignores generic words and short tokens", () => {
    expect(nameInTitle("పోలీస్ హెచ్చరిక | Police Warning", { people: ["సీఐ ప్రభాకర్"], places: ["శ్రీ సత్యసాయి జిల్లా"] })).toBe(false);
    expect(nameInTitle("ప్రభాకర్ హెచ్చరిక | Warning", { people: ["సీఐ ప్రభాకర్"], places: [] })).toBe(true);
  });
  test("knownNameIn recognises a gazetteer place or a known person in English", () => {
    expect(knownNameIn("Dharmavaram CI Challenge")).toBe(true);
    expect(knownNameIn("Evening Update")).toBe(false);
  });
});
