import { describe, expect, it } from "vitest";
import {
  generateEmailSetupTokenPlain,
  hashEmailSetupToken,
  isEmailSetupTokenPlainFormat,
} from "./tokenCrypto";

describe("emailSetupTokens tokenCrypto", () => {
  it("generates est_ prefixed token", () => {
    const plain = generateEmailSetupTokenPlain();
    expect(isEmailSetupTokenPlainFormat(plain)).toBe(true);
  });

  it("hash is stable and does not equal plain token", () => {
    const plain = generateEmailSetupTokenPlain();
    const hash = hashEmailSetupToken(plain);
    expect(hash).not.toBe(plain);
    expect(hashEmailSetupToken(plain)).toBe(hash);
  });
});
