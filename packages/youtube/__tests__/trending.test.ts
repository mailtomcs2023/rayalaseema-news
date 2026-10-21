import { describe, test, expect } from "bun:test";
import { velocity, outlier, topicKey } from "../src/trending";

describe("trending math", () => {
  test("velocity is views per hour with a 15 minute floor", () => {
    expect(velocity(1200, new Date("2026-10-20T00:00:00Z"), new Date("2026-10-20T02:00:00Z"))).toBe(600);
    expect(velocity(100, new Date("2026-10-20T00:00:00Z"), new Date("2026-10-20T00:01:00Z"))).toBe(400);
  });
  test("outlier compares to the median of similar-age history, 1 with none", () => {
    expect(outlier(5000, 10, [{ views: 1000, ageHours: 9 }, { views: 1200, ageHours: 11 }, { views: 800, ageHours: 30 }])).toBe(5000 / 1200);
    expect(outlier(5000, 10, [])).toBe(1);
    expect(outlier(5000, 10, [{ views: 0, ageHours: 10 }])).toBe(1);
  });
  test("topicKey canonicalises names and clusters the same story across channels", () => {
    const a = topicKey("రాచమల్లు స్ట్రాంగ్ వార్నింగ్ | Rachamallu Shiva Prasad Reddy Proddatur");
    const b = topicKey("Rachamallu Siva Prasad Reddy Warning In Proddatur | TDP");
    expect(a).toBe(b);
    expect(a).toContain("proddatur");
    expect(a).toContain("rachamallu siva prasad reddy");
  });
  test("topicKey of unrelated stories differ", () => {
    expect(topicKey("Tirupati Laddu Row Latest")).not.toBe(topicKey("Kurnool Bus Accident"));
  });
});
