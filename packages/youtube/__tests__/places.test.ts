import { describe, test, expect } from "bun:test";
import { detectPlace, townsIn, isRayalaseema } from "../src/places";

describe("places", () => {
  test("picks the earliest town in a multi-story title", () => {
    expect(detectPlace("యాడికిలో కరెంట్ | ప్రొద్దుటూరులో దసరా | కడపలో వర్షం")?.en).toBe("Yadiki");
  });
  test("town beats district HQ when both appear", () => {
    expect(detectPlace("కడప జిల్లా పులివెందులలో ఉద్రిక్తత")?.en).toBe("Pulivendula");
  });
  test("Anantapur short form", () => {
    expect(detectPlace("అనంత లో జవాన్‌పై దాడి")?.en).toBe("Anantapur");
  });
  test("non-local returns null", () => {
    expect(detectPlace("నేపాల్‌లో భయానకం")).toBeNull();
    expect(isRayalaseema("బిహార్‌లో మూఢనమ్మకాలు")).toBe(false);
  });
  test("townsIn lists every town mentioned in order", () => {
    expect(townsIn("తిరుపతిలో గ్యాస్ లీక్.. కడపలో హత్య").map((p) => p.en)).toEqual(["Tirupati", "Kadapa"]);
  });
});
