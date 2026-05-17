import { describe, expect, it } from "vitest";
import { formatIanaUtcOffsetPlaceholder } from "./formatIanaUtcOffsetPlaceholder";

describe("formatIanaUtcOffsetPlaceholder", () => {
  it("wraps GMT offset from Intl as UTC and appends IANA", () => {
    const s = formatIanaUtcOffsetPlaceholder("Europe/Moscow", new Date("2026-06-15T12:00:00Z"));
    expect(s).toMatch(/^\(UTC\+0?3:00\) Europe\/Moscow$/);
  });
});
