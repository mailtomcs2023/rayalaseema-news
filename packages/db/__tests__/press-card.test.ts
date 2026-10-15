// Press ID card verification - status derivation.
//   bun test packages/db
//
// The public /verify/<token> page shows exactly one of ACTIVE / EXPIRED /
// REVOKED. REVOKED is a stored flag and always wins; EXPIRED is derived from
// validTill at request time so nothing has to flip rows on a schedule.
import { describe, test, expect } from "bun:test";
import { computePressCardStatus, isValidPressCardToken } from "../src/press-card";

const base = {
  validFrom: new Date("2026-10-06T00:00:00Z"),
  validTill: new Date("2027-10-05T00:00:00Z"),
  status: "ACTIVE" as const,
  revokedAt: null as Date | null,
};

describe("computePressCardStatus", () => {
  test("active within validity window", () => {
    expect(computePressCardStatus(base, new Date("2027-01-01T00:00:00Z"))).toBe("ACTIVE");
  });

  test("active on the last valid day (validTill is inclusive, whole day)", () => {
    expect(computePressCardStatus(base, new Date("2027-10-05T18:30:00Z"))).toBe("ACTIVE");
  });

  test("expired the day after validTill", () => {
    expect(computePressCardStatus(base, new Date("2027-10-06T00:00:01Z"))).toBe("EXPIRED");
  });

  test("not yet valid before validFrom is reported as EXPIRED (not usable)", () => {
    expect(computePressCardStatus(base, new Date("2026-10-01T00:00:00Z"))).toBe("EXPIRED");
  });

  test("revoked wins over an otherwise valid window", () => {
    expect(
      computePressCardStatus({ ...base, status: "REVOKED", revokedAt: new Date("2026-12-01T00:00:00Z") }, new Date("2027-01-01T00:00:00Z")),
    ).toBe("REVOKED");
  });

  test("revoked wins over expired", () => {
    expect(
      computePressCardStatus({ ...base, status: "REVOKED", revokedAt: new Date("2026-12-01T00:00:00Z") }, new Date("2028-01-01T00:00:00Z")),
    ).toBe("REVOKED");
  });
});

describe("isValidPressCardToken", () => {
  test("accepts 12-char lowercase alphanumerics", () => {
    expect(isValidPressCardToken("a3dmykc2k3q7")).toBe(true);
  });
  test("rejects wrong length, uppercase, symbols, path tricks", () => {
    expect(isValidPressCardToken("short")).toBe(false);
    expect(isValidPressCardToken("A3DMYKC2K3Q7")).toBe(false);
    expect(isValidPressCardToken("a3dmykc2k3q7/")).toBe(false);
    expect(isValidPressCardToken("../../etc/pwd")).toBe(false);
    expect(isValidPressCardToken("")).toBe(false);
  });
});

import { nextCardNo, mintPressCardToken, defaultValidTill } from "../src/press-card";

describe("computePressCardStatus - SEPARATED", () => {
  test("lastWorkingDate in the past -> SEPARATED even inside validity", () => {
    expect(
      computePressCardStatus(base, new Date("2027-01-10T00:00:00Z"), { lastWorkingDate: new Date("2027-01-01T00:00:00Z") }),
    ).toBe("SEPARATED");
  });
  test("lastWorkingDate today (same calendar day) -> still ACTIVE until the day ends", () => {
    expect(
      computePressCardStatus(base, new Date("2027-01-01T15:00:00Z"), { lastWorkingDate: new Date("2027-01-01T00:00:00Z") }),
    ).toBe("ACTIVE");
  });
  test("lastWorkingDate in the future -> ACTIVE", () => {
    expect(
      computePressCardStatus(base, new Date("2027-01-01T00:00:00Z"), { lastWorkingDate: new Date("2027-06-30T00:00:00Z") }),
    ).toBe("ACTIVE");
  });
  test("REVOKED beats SEPARATED", () => {
    expect(
      computePressCardStatus({ ...base, status: "REVOKED" }, new Date("2027-02-01T00:00:00Z"), { lastWorkingDate: new Date("2027-01-01T00:00:00Z") }),
    ).toBe("REVOKED");
  });
  test("SEPARATED beats EXPIRED", () => {
    expect(
      computePressCardStatus(base, new Date("2028-02-01T00:00:00Z"), { lastWorkingDate: new Date("2027-01-01T00:00:00Z") }),
    ).toBe("SEPARATED");
  });
});

describe("nextCardNo", () => {
  test("first card of a year is 001", () => {
    expect(nextCardNo([], 2027)).toBe("RSN/2027/001");
  });
  test("continues from the highest number of that year only", () => {
    expect(nextCardNo(["RSN/2026/001", "RSN/2026/005", "RSN/2026/003"], 2026)).toBe("RSN/2026/006");
  });
  test("year rollover ignores previous years", () => {
    expect(nextCardNo(["RSN/2026/005"], 2027)).toBe("RSN/2027/001");
  });
  test("ignores malformed numbers", () => {
    expect(nextCardNo(["junk", "RSN/2026/0X1", "RSN/2026/002"], 2026)).toBe("RSN/2026/003");
  });
});

describe("mintPressCardToken", () => {
  test("12 chars from the unambiguous alphabet and passes isValidPressCardToken", () => {
    const t = mintPressCardToken();
    expect(t).toHaveLength(12);
    expect(/^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/.test(t)).toBe(true);
    expect(isValidPressCardToken(t)).toBe(true);
  });
  test("deterministic with injected random", () => {
    expect(mintPressCardToken(() => 0)).toBe("aaaaaaaaaaaa");
  });
});

describe("defaultValidTill", () => {
  test("one year minus one day, UTC calendar", () => {
    expect(defaultValidTill(new Date("2026-10-06T00:00:00Z")).toISOString()).toBe("2027-10-05T00:00:00.000Z");
  });
  test("leap-day issue date lands on 28 Feb next year", () => {
    expect(defaultValidTill(new Date("2028-02-29T00:00:00Z")).toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });
});
