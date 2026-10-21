import { describe, test, expect } from "bun:test";
import { defaultChosen, canPublish, canApprove, quotaEstimate } from "../../src/components/video-iq/panel-logic";
import { SAMPLE } from "../../../../packages/youtube/__tests__/contract.test";

const row: any = {
  status: "READY",
  source: "BLOB",
  suggestions: SAMPLE,
  thumbnails: [{ renderedUrl: null, frameUrl: "https://blob/f1.jpg" }, { renderedUrl: "https://blob/t2.jpg", frameUrl: "https://blob/f2.jpg" }],
  chosen: null,
};

describe("defaultChosen", () => {
  test("picks title 1, first rendered thumbnail, top 2 playlists, pinned comment", () => {
    const c = defaultChosen(row);
    expect(c.title).toBe(SAMPLE.titles[0].text);
    expect(c.thumbnailIndex).toBe(1);
    expect(c.thumbnailUrl).toBe("https://blob/t2.jpg");
    expect(c.playlists).toEqual(["Politics", "District Stories"]);
    expect(c.comment).toBe(SAMPLE.pinned_comment);
    expect(c.tags).toEqual(SAMPLE.tags);
  });
  test("no rendered thumbnail means null thumbnail", () => {
    const c = defaultChosen({ ...row, thumbnails: [{ renderedUrl: null, frameUrl: "x" }] });
    expect(c.thumbnailIndex).toBeNull();
    expect(c.thumbnailUrl).toBeNull();
  });
  test("an existing chosen is returned as is", () => {
    const chosen = { ...defaultChosen(row), title: "కస్టమ్ | Custom" };
    expect(defaultChosen({ ...row, chosen }).title).toBe("కస్టమ్ | Custom");
  });
});

describe("gates", () => {
  const approved = { ...row, status: "APPROVED", chosen: defaultChosen(row) };
  test("canApprove needs READY/APPROVED and an editor or admin", () => {
    expect(canApprove({ ...row, chosen: defaultChosen(row) }, "EDITOR").ok).toBe(true);
    expect(canApprove({ ...row, chosen: defaultChosen(row) }, "SUB_EDITOR").ok).toBe(false);
    expect(canApprove({ ...row, status: "ANALYZING" }, "EDITOR").ok).toBe(false);
  });
  test("canPublish blocks not_fit without override and non-editors", () => {
    expect(canPublish(approved, "EDITOR").ok).toBe(true);
    expect(canPublish(approved, "ADMIN").ok).toBe(true);
    expect(canPublish(approved, "SUB_EDITOR").ok).toBe(false);
    const notFit = { ...approved, suggestions: { ...SAMPLE, fit: { ...SAMPLE.fit, verdict: "not_fit" } } };
    expect(canPublish(notFit, "EDITOR").reason).toMatch(/not a fit/);
    expect(canPublish({ ...notFit, chosen: { ...approved.chosen, override: { note: "owner says ok", by: "u", at: "t" } } }, "EDITOR").ok).toBe(true);
    expect(canPublish({ ...approved, status: "READY" }, "EDITOR").reason).toMatch(/approve/i);
  });
  test("quotaEstimate: new upload vs back-catalog update", () => {
    // insert 1600 + thumbnail 50 + 2 playlists 100 + localisation 50 + comment 50
    expect(quotaEstimate({ ...approved, source: "BLOB" })).toBe(1850);
    // update 50 + thumbnail 50 + 2 playlists 100 + localisation 50 + comment 50
    expect(quotaEstimate({ ...approved, source: "YOUTUBE" })).toBe(300);
    expect(quotaEstimate({ ...approved, source: "BLOB", chosen: { ...approved.chosen, playlists: [], comment: "" } })).toBe(1700);
    expect(quotaEstimate({ ...approved, source: "BLOB", suggestions: { ...SAMPLE, format: "SHORT" } })).toBe(1800);
  });
});
