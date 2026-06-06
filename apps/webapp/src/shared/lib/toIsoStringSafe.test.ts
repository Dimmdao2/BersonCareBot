import { describe, expect, it } from "vitest";
import { nullableToIsoStringSafe, toIsoStringSafe } from "./toIsoStringSafe";

describe("toIsoStringSafe", () => {
  it("serializes Date", () => {
    const d = new Date("2026-06-06T01:40:00.000Z");
    expect(toIsoStringSafe(d)).toBe("2026-06-06T01:40:00.000Z");
  });

  it("serializes ISO string", () => {
    expect(toIsoStringSafe("2026-06-06T01:40:00.000Z")).toBe("2026-06-06T01:40:00.000Z");
  });

  it("nullable returns null for empty", () => {
    expect(nullableToIsoStringSafe(null)).toBeNull();
    expect(nullableToIsoStringSafe(undefined)).toBeNull();
  });
});
