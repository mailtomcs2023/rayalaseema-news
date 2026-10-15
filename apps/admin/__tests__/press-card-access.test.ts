import { describe, test, expect } from "bun:test";
import { decideAccess } from "../src/lib/press-card/access";

const base = { cardUserId: "u1", liveStatus: "ACTIVE" as const };

describe("decideAccess", () => {
  test("valid short token -> allowed", () => {
    expect(decideAccess({ ...base, tokenCardId: "card1", cardId: "card1", holderId: null, role: undefined })).toEqual({ allowed: true, staff: false });
  });

  test("holder of own card -> allowed", () => {
    expect(decideAccess({ ...base, tokenCardId: null, cardId: "card1", holderId: "u1", role: undefined })).toEqual({ allowed: true, staff: false });
  });

  test("holder of other card -> denied", () => {
    const r = decideAccess({ ...base, tokenCardId: null, cardId: "card1", holderId: "u2", role: undefined });
    expect(r.allowed).toBe(false);
  });

  test("ADMIN session -> allowed + staff", () => {
    expect(decideAccess({ ...base, tokenCardId: null, cardId: "card1", holderId: null, role: "ADMIN" })).toEqual({ allowed: true, staff: true });
  });

  test("EDITOR session -> allowed + staff", () => {
    expect(decideAccess({ ...base, tokenCardId: null, cardId: "card1", holderId: null, role: "EDITOR" })).toEqual({ allowed: true, staff: true });
  });

  test("nobody -> denied", () => {
    const r = decideAccess({ ...base, tokenCardId: null, cardId: "card1", holderId: null, role: undefined });
    expect(r.allowed).toBe(false);
  });

  for (const liveStatus of ["SEPARATED", "REVOKED", "EXPIRED"] as const) {
    test(`holder with liveStatus ${liveStatus} -> denied with reason`, () => {
      const r = decideAccess({ cardUserId: "u1", liveStatus, tokenCardId: null, cardId: "card1", holderId: "u1", role: undefined });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe(liveStatus);
    });

    test(`staff still allowed when liveStatus ${liveStatus}`, () => {
      const r = decideAccess({ cardUserId: "u1", liveStatus, tokenCardId: null, cardId: "card1", holderId: null, role: "ADMIN" });
      expect(r).toEqual({ allowed: true, staff: true });
    });
  }
});
