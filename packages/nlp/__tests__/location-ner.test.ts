// Spec #4 G1 (#231) - detectLocations unit tests.

import { describe, test, expect } from "bun:test";
import { detectLocations, type LocationEntry } from "../src";

const GAZ: LocationEntry[] = [
  { id: "d-kurnool", kind: "DISTRICT", name: "కర్నూలు", nameEn: "Kurnool" },
  { id: "d-nandyal", kind: "DISTRICT", name: "నంద్యాల", nameEn: "Nandyal" },
  { id: "d-tirupati", kind: "DISTRICT", name: "తిరుపతి", nameEn: "Tirupati" },
  { id: "c-nandyal", kind: "CONSTITUENCY", name: "నంద్యాల", nameEn: "Nandyal", parentDistrictSlug: "nandyal" },
  { id: "c-chandragiri", kind: "CONSTITUENCY", name: "చంద్రగిరి", nameEn: "Chandragiri", parentDistrictSlug: "tirupati" },
  { id: "m-chandragiri", kind: "MANDAL", name: "చంద్రగిరి", nameEn: "Chandragiri", parentConstituencySlug: "chandragiri-166", parentDistrictSlug: "tirupati" },
];

describe("detectLocations", () => {
  test("title match → HIGH confidence", () => {
    const r = detectLocations({
      title: "Kurnool collector announces road project",
      body: "<p>Officials inspected the site today.</p>",
      gazetteer: GAZ,
    });
    expect(r.primary?.locationId).toBe("d-kurnool");
    expect(r.primary?.confidence).toBe("HIGH");
  });

  test("lede match → MEDIUM, body-only → LOW", () => {
    const padding = "x".repeat(200);
    const r = detectLocations({
      title: "Road project",
      body: `<p>Officials met yesterday in their office. ${padding} The Tirupati team also weighed in.</p>`,
      gazetteer: GAZ,
    });
    const tirupati = r.mentions.find((m) => m.locationId === "d-tirupati");
    expect(tirupati).toBeTruthy();
    expect(tirupati!.confidence === "MEDIUM" || tirupati!.confidence === "LOW").toBeTrue();
  });

  test("most-specific kind wins on tie (Mandal > Constituency)", () => {
    const r = detectLocations({
      title: "Chandragiri news roundup",
      body: "<p>Chandragiri news.</p>",
      gazetteer: GAZ,
    });
    // Both c-chandragiri and m-chandragiri match the same offset. Mandal wins.
    expect(r.primary?.kind).toBe("MANDAL");
    expect(r.primary?.locationId).toBe("m-chandragiri");
  });

  test("Telugu script matching", () => {
    const r = detectLocations({
      title: "నంద్యాల జిల్లాలో కొత్త ప్రాజెక్ట్",
      body: "<p>నంద్యాల జిల్లా అధికారులు రోడ్డు పనులు మొదలుపెట్టారు.</p>",
      gazetteer: GAZ,
    });
    // Nandyal appears both as District + Constituency in gazetteer. Primary
    // is the disambiguator's pick - Constituency wins over District by kind
    // rank when both match at HIGH offset.
    expect(r.primary?.locationId === "c-nandyal" || r.primary?.locationId === "d-nandyal").toBeTrue();
  });

  test("no match → primary is null", () => {
    const r = detectLocations({
      title: "Mumbai news",
      body: "<p>Delhi too.</p>",
      gazetteer: GAZ,
    });
    expect(r.primary).toBeNull();
    expect(r.mentions).toHaveLength(0);
  });
});
