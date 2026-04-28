import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { getMoodDateForTimeZone } from "./moodDate";

describe("getMoodDateForTimeZone", () => {
  it("uses the app display timezone calendar day", () => {
    const now = DateTime.fromISO("2026-04-28T21:30:00.000Z", { zone: "utc" });
    expect(getMoodDateForTimeZone("Europe/Moscow", now)).toBe("2026-04-29");
    expect(getMoodDateForTimeZone("America/New_York", now)).toBe("2026-04-28");
  });
});
