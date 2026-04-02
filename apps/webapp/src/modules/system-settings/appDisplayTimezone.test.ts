import { describe, expect, it } from "vitest";
import { DEFAULT_APP_DISPLAY_TIMEZONE, normalizeAppDisplayTimeZone } from "./appDisplayTimezone";

describe("appDisplayTimezone", () => {
  it("normalizeAppDisplayTimeZone accepts IANA-like ids", () => {
    expect(normalizeAppDisplayTimeZone("Europe/Moscow")).toBe("Europe/Moscow");
  });

  it("normalizeAppDisplayTimeZone falls back on empty or invalid", () => {
    expect(normalizeAppDisplayTimeZone("")).toBe(DEFAULT_APP_DISPLAY_TIMEZONE);
    expect(normalizeAppDisplayTimeZone("not a zone!")).toBe(DEFAULT_APP_DISPLAY_TIMEZONE);
  });
});
