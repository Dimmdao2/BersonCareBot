import { describe, expect, it } from "vitest";
import { parseSystemSettingBoolean } from "./systemSettingBoolean.js";

describe("parseSystemSettingBoolean", () => {
  it("false for missing or invalid json", () => {
    expect(parseSystemSettingBoolean(undefined)).toBe(false);
    expect(parseSystemSettingBoolean(null)).toBe(false);
    expect(parseSystemSettingBoolean("true")).toBe(false);
    expect(parseSystemSettingBoolean({ value: "true" })).toBe(false);
  });

  it("true only when value is boolean true", () => {
    expect(parseSystemSettingBoolean({ value: true })).toBe(true);
    expect(parseSystemSettingBoolean({ value: false })).toBe(false);
    expect(parseSystemSettingBoolean({})).toBe(false);
  });
});
