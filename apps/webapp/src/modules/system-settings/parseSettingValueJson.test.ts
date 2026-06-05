import { describe, expect, it } from "vitest";
import { parseSettingEnvelopeValue, parseSmsFallbackEnabledValue } from "./parseSettingValueJson";

describe("parseSettingEnvelopeValue", () => {
  it("returns inner value from envelope", () => {
    expect(parseSettingEnvelopeValue({ value: "https://t.me/x", extra: 1 })).toBe("https://t.me/x");
  });

  it("returns null for non-object or missing value key", () => {
    expect(parseSettingEnvelopeValue(null)).toBeNull();
    expect(parseSettingEnvelopeValue("x")).toBeNull();
    expect(parseSettingEnvelopeValue({})).toBeNull();
  });
});

describe("parseSmsFallbackEnabledValue", () => {
  it("parses boolean and string flags", () => {
    expect(parseSmsFallbackEnabledValue({ value: true })).toBe(true);
    expect(parseSmsFallbackEnabledValue({ value: "false" })).toBe(false);
    expect(parseSmsFallbackEnabledValue({ value: "1" })).toBe(true);
  });

  it("returns null for invalid envelope", () => {
    expect(parseSmsFallbackEnabledValue(null)).toBeNull();
    expect(parseSmsFallbackEnabledValue({ value: 42 })).toBeNull();
  });
});
