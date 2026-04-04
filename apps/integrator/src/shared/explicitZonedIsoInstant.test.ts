import { describe, expect, it } from "vitest";
import { isExplicitZonedIsoInstant } from "./explicitZonedIsoInstant.js";

describe("isExplicitZonedIsoInstant", () => {
  it("accepts ISO-Z", () => {
    expect(isExplicitZonedIsoInstant("2026-04-07T08:00:00.000Z")).toBe(true);
  });

  it("accepts numeric offsets", () => {
    expect(isExplicitZonedIsoInstant("2026-04-07T11:00:00+03:00")).toBe(true);
    expect(isExplicitZonedIsoInstant("2026-04-07T11:00:00+0300")).toBe(true);
  });

  it("rejects naive wall clock", () => {
    expect(isExplicitZonedIsoInstant("2026-04-07 11:00:00")).toBe(false);
    expect(isExplicitZonedIsoInstant("2026-04-07T11:00:00")).toBe(false);
  });

  it("rejects parseable strings without zone", () => {
    expect(isExplicitZonedIsoInstant("2026-04-07")).toBe(false);
  });
});
