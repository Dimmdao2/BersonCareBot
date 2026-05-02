import { describe, expect, it } from "vitest";
import {
  normalizeTestAccountIdentifiersValue,
  relayRecipientAllowedInDevMode,
  sessionMatchesTestAccountIdentifiers,
} from "./testAccounts";

describe("normalizeTestAccountIdentifiersValue", () => {
  it("returns null for invalid top-level", () => {
    expect(normalizeTestAccountIdentifiersValue(null)).toBeNull();
    expect(normalizeTestAccountIdentifiersValue([])).toBeNull();
    expect(normalizeTestAccountIdentifiersValue("x")).toBeNull();
  });

  it("normalizes phones to E.164, dedupes, drops invalid phones", () => {
    const v = normalizeTestAccountIdentifiersValue({
      phones: ["+7 999 000 00 01", "+79990000001", "bad"],
      telegramIds: [],
      maxIds: [],
    });
    expect(v).toEqual({
      phones: ["+79990000001"],
      telegramIds: [],
      maxIds: [],
    });
  });

  it("trims and dedupes telegram and max ids", () => {
    const v = normalizeTestAccountIdentifiersValue({
      phones: [],
      telegramIds: [" 1 ", "1", "2"],
      maxIds: ["a", "a"],
    });
    expect(v).toEqual({ phones: [], telegramIds: ["1", "2"], maxIds: ["a"] });
  });
});

describe("sessionMatchesTestAccountIdentifiers", () => {
  const spec = { phones: ["+79991112233"], telegramIds: ["42"], maxIds: ["mx"] };

  it("matches by normalized phone", () => {
    expect(sessionMatchesTestAccountIdentifiers({ phone: "+7 999 111 22 33" }, spec)).toBe(true);
  });

  it("matches telegram and max", () => {
    expect(sessionMatchesTestAccountIdentifiers({ telegramId: "42" }, spec)).toBe(true);
    expect(sessionMatchesTestAccountIdentifiers({ maxId: "mx" }, spec)).toBe(true);
  });

  it("returns false when no match", () => {
    expect(sessionMatchesTestAccountIdentifiers({ phone: "+70000000000" }, spec)).toBe(false);
  });
});

describe("relayRecipientAllowedInDevMode", () => {
  const spec = { phones: [], telegramIds: ["9"], maxIds: ["m"] };

  it("allows telegram and max recipients", () => {
    expect(relayRecipientAllowedInDevMode("telegram", "9", spec)).toBe(true);
    expect(relayRecipientAllowedInDevMode("max", "m", spec)).toBe(true);
  });

  it("is fail-closed for unknown channel", () => {
    expect(relayRecipientAllowedInDevMode("sms", "+7999", spec)).toBe(false);
  });
});
