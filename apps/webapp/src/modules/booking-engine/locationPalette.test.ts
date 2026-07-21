import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOOKING_LOCATION_PALETTE,
  normalizeBookingLocationPalette,
  physicalLocationColorAt,
  resolveBookingLocationPalette,
} from "./locationPalette";

describe("booking location default palette", () => {
  it("normalizes a valid extensible structured setting", () => {
    expect(normalizeBookingLocationPalette({
      value: {
        physicalPalette: ["#123abc", "#223344", "#334455", "#445566", "#556677", "#667788"],
        online: "#aabbcc",
      },
    })).toEqual({
      physicalPalette: ["#123ABC", "#223344", "#334455", "#445566", "#556677", "#667788"],
      online: "#AABBCC",
    });
  });

  it.each([
    null,
    { value: { physicalPalette: ["#111111", "#222222", "#333333", "#444444"], online: "#555555" } },
    { value: { physicalPalette: ["#111111", "#222222", "#333333", "#444444", "bad"], online: "#555555" } },
    { value: { physicalPalette: ["#111111", "#222222", "#333333", "#444444", "#555555"], online: "bad" } },
  ])("fails closed to the migration-safe defaults for %j", (value) => {
    expect(resolveBookingLocationPalette(value)).toBe(DEFAULT_BOOKING_LOCATION_PALETTE);
  });

  it("cycles physical colors without involving the Online default", () => {
    expect(physicalLocationColorAt(0, DEFAULT_BOOKING_LOCATION_PALETTE)).toBe("#2563EB");
    expect(physicalLocationColorAt(4, DEFAULT_BOOKING_LOCATION_PALETTE)).toBe("#7C3AED");
    expect(physicalLocationColorAt(5, DEFAULT_BOOKING_LOCATION_PALETTE)).toBe("#2563EB");
    expect(DEFAULT_BOOKING_LOCATION_PALETTE.online).toBe("#7C3AED");
  });
});
