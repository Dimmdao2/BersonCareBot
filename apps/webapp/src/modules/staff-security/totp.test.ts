import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  hashStaffSecuritySecret,
  verifyTotpCode,
} from "./totp";

describe("staff TOTP primitives", () => {
  afterEach(() => vi.useRealTimers());

  it("accepts the RFC 6238 SHA-1 vector truncated to six digits", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(verifyTotpCode(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotpCode(secret, "287083", 59_000)).toBe(false);
  });

  it("encrypts the factor secret at rest with authenticated randomized ciphertext", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const first = encryptTotpSecret(secret);
    const second = encryptTotpSecret(secret);
    expect(first).not.toBe(second);
    expect(decryptTotpSecret(first)).toBe(secret);
    const [iv, tag, payload] = first.split(".");
    if (!iv || !tag || !payload) throw new Error("ciphertext fixture invalid");
    const tamperedPayload = `${payload[0] === "A" ? "B" : "A"}${payload.slice(1)}`;
    expect(() => decryptTotpSecret([iv, tag, tamperedPayload].join("."))).toThrow();
  });

  it("normalizes one-time recovery codes before hashing and encodes the account label", () => {
    expect(hashStaffSecuritySecret(" abcd-1234 ")).toBe(hashStaffSecuritySecret("ABCD-1234"));
    expect(buildTotpUri({ secret: "ABC", email: "owner+clinic@example.test" })).toContain(
      "BersonCare%3Aowner%2Bclinic%40example.test",
    );
  });
});
