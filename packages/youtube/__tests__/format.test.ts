import { describe, test, expect } from "bun:test";
import { classifyFormat } from "../src/format";

describe("classifyFormat", () => {
  test("vertical 89s is a SHORT", () => expect(classifyFormat({ durationSec: 89, width: 1080, height: 1920 })).toBe("SHORT"));
  test("vertical 181s is a VIDEO", () => expect(classifyFormat({ durationSec: 181, width: 1080, height: 1920 })).toBe("VIDEO"));
  test("landscape 40s is a VIDEO", () => expect(classifyFormat({ durationSec: 40, width: 1920, height: 1080 })).toBe("VIDEO"));
  test("unknown aspect falls back to 60s rule", () => {
    expect(classifyFormat({ durationSec: 50 })).toBe("SHORT");
    expect(classifyFormat({ durationSec: 61 })).toBe("VIDEO");
  });
});
