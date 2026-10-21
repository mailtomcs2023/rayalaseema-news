import { describe, test, expect } from "bun:test";
import { parseSrt } from "../src/srt";

const SRT = `1\n00:00:01,000 --> 00:00:03,500\nప్రొద్దుటూరులో ఉద్రిక్తత\n\n2\n00:00:03,500 --> 00:00:06,000\nవైసీపీ అభ్యర్థి ఇంటిపై దాడి\n`;

describe("parseSrt", () => {
  test("parses cues to seconds", () => {
    expect(parseSrt(SRT)).toEqual([
      { start: 1, end: 3.5, text: "ప్రొద్దుటూరులో ఉద్రిక్తత" },
      { start: 3.5, end: 6, text: "వైసీపీ అభ్యర్థి ఇంటిపై దాడి" },
    ]);
  });
  test("joins multi-line cues and tolerates CRLF", () => {
    expect(parseSrt("1\r\n00:00:00,000 --> 00:00:02,000\r\nline one\r\nline two\r\n")).toEqual([{ start: 0, end: 2, text: "line one line two" }]);
  });
  test("empty input gives empty list", () => expect(parseSrt("")).toEqual([]));
});
