import { describe, expect, it } from "vitest";
import {
  normalizeIdentityEmail,
  normalizeIdentityPhone,
  shouldSkipSupplementaryContactUpsert,
  supplementaryContactMatchesIdentity,
} from "./identityContactMatch";

describe("identityContactMatch", () => {
  it("detects phone and email duplicates against identity", () => {
    expect(
      supplementaryContactMatchesIdentity("phone", "+79001112233", {
        phone: "+79001112233",
        email: null,
      }),
    ).toBe(true);
    expect(
      supplementaryContactMatchesIdentity("email", "a@b.co", {
        phone: null,
        email: "a@b.co",
      }),
    ).toBe(true);
    expect(
      supplementaryContactMatchesIdentity("phone", "+79004445566", {
        phone: "+79001112233",
        email: null,
      }),
    ).toBe(false);
  });

  it("shouldSkipSupplementaryContactUpsert respects normalized identity", () => {
    expect(
      shouldSkipSupplementaryContactUpsert("phone", "8 900 111-22-33", {
        phone: "+79001112233",
      }),
    ).toBe(true);
    expect(shouldSkipSupplementaryContactUpsert("email", "alt@example.com", null)).toBe(false);
  });

  it("normalizeIdentityEmail returns null for invalid identity email", () => {
    expect(normalizeIdentityEmail("not-an-email")).toBeNull();
    expect(normalizeIdentityPhone("+79001112233")).toBe("+79001112233");
  });
});
