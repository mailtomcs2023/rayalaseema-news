import { describe, test, expect } from "bun:test";
import { toDto, issuableReason, issueErrorStatus } from "../src/lib/press-card/service";

const row = {
  id: "c1", cardNo: "RSN/2026/001", token: "a3dmykc2k3q7", name: "A", designation: "Reporter", photoUrl: "https://x/p.jpg",
  validFrom: new Date("2026-10-06T00:00:00Z"), validTill: new Date("2027-10-05T00:00:00Z"), status: "ACTIVE" as const,
  revokedAt: null, revokeNote: null, userId: "u1", user: { lastWorkingDate: null },
};

describe("toDto", () => {
  test("adds liveStatus + verifyUrl, ISO dates", () => {
    const d = toDto(row, new Date("2027-01-01T00:00:00Z"));
    expect(d.liveStatus).toBe("ACTIVE");
    expect(d.verifyUrl).toBe("https://rayalaseemanews.com/verify/a3dmykc2k3q7");
    expect(d.validFrom).toBe("2026-10-06");
  });
  test("SEPARATED from holder", () => {
    expect(toDto({ ...row, user: { lastWorkingDate: new Date("2026-12-01T00:00:00Z") } }, new Date("2027-01-01T00:00:00Z")).liveStatus).toBe("SEPARATED");
  });
});

describe("issuableReason", () => {
  test("verified + photo + no active card -> null", () => {
    expect(issuableReason({ kycStatus: "VERIFIED", photoUrl: "https://x/p.jpg" }, null)).toBeNull();
  });
  test("kyc not verified", () => {
    expect(issuableReason({ kycStatus: "SUBMITTED", photoUrl: "https://x/p.jpg" }, null)).toBe("KYC_NOT_VERIFIED");
  });
  test("no photo", () => {
    expect(issuableReason({ kycStatus: "VERIFIED", photoUrl: null }, null)).toBe("NO_PHOTO");
  });
  test("already has an ACTIVE card", () => {
    expect(issuableReason({ kycStatus: "VERIFIED", photoUrl: "https://x/p.jpg" }, { liveStatus: "ACTIVE" })).toBe("ALREADY_ACTIVE");
  });
  test("expired card does not block re-issue", () => {
    expect(issuableReason({ kycStatus: "VERIFIED", photoUrl: "https://x/p.jpg" }, { liveStatus: "EXPIRED" })).toBeNull();
  });
  test("no profile row at all", () => {
    expect(issuableReason(null, null)).toBe("KYC_NOT_VERIFIED");
  });
});

describe("issueErrorStatus", () => {
  test("NOT_FOUND -> 404", () => {
    expect(issueErrorStatus("NOT_FOUND")).toBe(404);
  });
  test("every other code -> 409", () => {
    for (const code of ["KYC_NOT_VERIFIED", "NO_PHOTO", "ALREADY_ACTIVE", "NOT_ACTIVE", "CONFLICT"] as const) {
      expect(issueErrorStatus(code)).toBe(409);
    }
  });
});
