import { describe, expect, it } from "vitest";
import { createLazyStaffSecurityCryptoFromEnv, createStaffSecurityCrypto } from "./crypto";

const OLD_KEY = Buffer.alloc(32, 3).toString("base64");
const NEW_KEY = Buffer.alloc(32, 7).toString("base64");

describe("staff security keyring crypto", () => {
  it("writes with the active key and reads retained-key envelopes after rotation", () => {
    const beforeRotation = createStaffSecurityCrypto({ activeKeyId: "old", keys: { old: OLD_KEY } });
    const envelope = beforeRotation.encryptTotpSecret("JBSWY3DPEHPK3PXP");
    const recoveryHash = beforeRotation.hashRecoveryCode(" abcd-1234 ");

    const afterRotation = createStaffSecurityCrypto({
      activeKeyId: "new",
      keys: { old: OLD_KEY, new: NEW_KEY },
    });
    expect(envelope).toContain("bsc-totp.v1.old.");
    expect(afterRotation.decryptTotpSecret(envelope)).toBe("JBSWY3DPEHPK3PXP");
    expect(afterRotation.matchRecoveryCodeHash("ABCD-1234", [recoveryHash])).toBe(recoveryHash);
    expect(afterRotation.encryptTotpSecret("next")).toContain("bsc-totp.v1.new.");
  });

  it("fails closed for tampering, missing retained keys, and a wrong key", () => {
    const writer = createStaffSecurityCrypto({ activeKeyId: "old", keys: { old: OLD_KEY } });
    const envelope = writer.encryptTotpSecret("secret");
    const parts = envelope.split(".");
    parts[5] = `${parts[5]?.startsWith("A") ? "B" : "A"}${parts[5]?.slice(1)}`;
    expect(() => writer.decryptTotpSecret(parts.join("."))).toThrow();

    const missing = createStaffSecurityCrypto({ activeKeyId: "new", keys: { new: NEW_KEY } });
    expect(() => missing.decryptTotpSecret(envelope)).toThrow("staff_security_read_key_missing:old");

    const wrong = createStaffSecurityCrypto({ activeKeyId: "old", keys: { old: NEW_KEY } });
    expect(() => wrong.decryptTotpSecret(envelope)).toThrow();
  });

  it("rejects malformed configuration and does not fall back to the session cookie secret", () => {
    expect(() => createStaffSecurityCrypto({ activeKeyId: "missing", keys: { old: OLD_KEY } })).toThrow(
      "staff_security_active_key_missing",
    );
    expect(() => createStaffSecurityCrypto({ activeKeyId: "bad", keys: { bad: "short" } })).toThrow(
      "staff_security_key_invalid:bad",
    );
    const lazy = createLazyStaffSecurityCryptoFromEnv(() => undefined);
    expect(() => lazy.encryptTotpSecret("secret")).toThrow("STAFF_SECURITY_KEYRING_JSON is required");
  });

  it("binds login challenge hashes to retained key ids", () => {
    const old = createStaffSecurityCrypto({ activeKeyId: "old", keys: { old: OLD_KEY } });
    const stored = old.hashLoginChallenge("challenge");
    const rotated = createStaffSecurityCrypto({ activeKeyId: "new", keys: { old: OLD_KEY, new: NEW_KEY } });
    expect(rotated.matchesLoginChallenge("challenge", stored)).toBe(true);
    expect(rotated.matchesLoginChallenge("other", stored)).toBe(false);
  });
});
