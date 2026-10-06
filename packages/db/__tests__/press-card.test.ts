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
