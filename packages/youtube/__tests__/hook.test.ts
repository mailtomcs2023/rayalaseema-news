import { describe, test, expect } from "bun:test";
import { hookCheck } from "../src/hook";

describe("hookCheck", () => {
  test("greeting first means late hook with the real start time", () => {
    const r = hookCheck([
      { start: 0, end: 4, text: "రాయలసీమ న్యూస్‌కు స్వాగతం" },
      { start: 4, end: 9, text: "ప్రొద్దుటూరులో వైసీపీ అభ్యర్థి ఇంటిపై దాడి" },
    ], false);
    expect(r.late).toBe(true);
    expect(r.startsAt).toBe(4);
  });
  test("news in the first segment is fine", () => {
    expect(hookCheck([{ start: 0, end: 3, text: "కడపలో దారుణం.. అన్నను గొడ్డలితో హత్య" }], false).late).toBe(false);
  });
  test("shorts use a 2 second window", () => {
    expect(hookCheck([
      { start: 0, end: 2.5, text: "నమస్కారం" },
      { start: 2.5, end: 5, text: "కడపలో దారుణం జరిగింది" },
    ], true).late).toBe(true);
  });
  test("no speech at all reports a late hook with a reason", () => {
    const r = hookCheck([], false);
    expect(r.late).toBe(true);
    expect(r.reason).toMatch(/no speech/);
  });
});
