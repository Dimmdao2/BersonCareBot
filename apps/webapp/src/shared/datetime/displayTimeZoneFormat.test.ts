import { describe, expect, it } from "vitest";
import {
  formatDisplayZoneDayRuFromBucket,
  toDisplayZoneDayKey,
  toDisplayZoneHourBucketKey,
} from "./displayTimeZoneFormat";

describe("displayTimeZoneFormat", () => {
  it("maps UTC instant to Europe/Moscow day key", () => {
    expect(toDisplayZoneDayKey("2026-05-28T21:30:00.000Z", "Europe/Moscow")).toBe("2026-05-29");
  });

  it("maps UTC instant to hour bucket in display zone", () => {
    expect(toDisplayZoneHourBucketKey("2026-05-28T21:30:00.000Z", "Europe/Moscow")).toBe(
      "2026-05-29T00:00:00",
    );
  });

  it("formats PG local bucket day in Russian", () => {
    expect(formatDisplayZoneDayRuFromBucket("2026-05-28 00:00:00")).toMatch(/28/);
  });
});
