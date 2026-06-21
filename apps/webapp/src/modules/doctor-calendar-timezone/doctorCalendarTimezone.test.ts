/**
 * Unit tests for doctor calendar timezone resolution chain:
 *   personal TZ ?? branch TZ ?? app_display_timezone
 */
import { describe, it, expect } from "vitest";
import { resolveDoctorCalendarIana } from "./doctorCalendarTimezone";

const APP_DEFAULT = "Europe/Moscow";

describe("resolveDoctorCalendarIana", () => {
  it("returns doctor personal TZ when set to valid IANA", () => {
    expect(
      resolveDoctorCalendarIana("Asia/Vladivostok", "Europe/London", APP_DEFAULT),
    ).toBe("Asia/Vladivostok");
  });

  it("falls back to branch TZ when personal TZ is null", () => {
    expect(
      resolveDoctorCalendarIana(null, "Europe/London", APP_DEFAULT),
    ).toBe("Europe/London");
  });

  it("falls back to branch TZ when personal TZ is empty string", () => {
    expect(
      resolveDoctorCalendarIana("", "America/New_York", APP_DEFAULT),
    ).toBe("America/New_York");
  });

  it("falls back to app_display_timezone when personal and branch are both null", () => {
    expect(
      resolveDoctorCalendarIana(null, null, "Europe/Helsinki"),
    ).toBe("Europe/Helsinki");
  });

  it("falls back to app_display_timezone when personal and branch are both empty", () => {
    expect(
      resolveDoctorCalendarIana("", "", APP_DEFAULT),
    ).toBe(APP_DEFAULT);
  });

  it("falls back to app_display_timezone when personal and branch are both undefined", () => {
    expect(
      resolveDoctorCalendarIana(undefined, undefined, "Asia/Tokyo"),
    ).toBe("Asia/Tokyo");
  });

  it("returns Europe/Moscow as default when appDefaultRaw is also invalid", () => {
    // normalizeAppDisplayTimeZone falls back to DEFAULT_APP_DISPLAY_TIMEZONE = Europe/Moscow
    expect(
      resolveDoctorCalendarIana(null, null, ""),
    ).toBe("Europe/Moscow");
  });

  it("ignores invalid personal TZ strings and falls back to branch", () => {
    expect(
      resolveDoctorCalendarIana("Not/A/Real/TZ!!", "Europe/Paris", APP_DEFAULT),
    ).toBe("Europe/Paris");
  });

  it("ignores invalid branch TZ and falls back to app default", () => {
    expect(
      resolveDoctorCalendarIana(null, "garbage", "Europe/Riga"),
    ).toBe("Europe/Riga");
  });

  it("personal TZ whitespace-only is treated as empty → falls back", () => {
    expect(
      resolveDoctorCalendarIana("   ", "Europe/Rome", APP_DEFAULT),
    ).toBe("Europe/Rome");
  });

  it("accepts Asia/Vladivostok as valid IANA (the key use-case)", () => {
    expect(
      resolveDoctorCalendarIana("Asia/Vladivostok", null, APP_DEFAULT),
    ).toBe("Asia/Vladivostok");
  });

  it("personal TZ wins over both branch and app default", () => {
    expect(
      resolveDoctorCalendarIana("Pacific/Auckland", "Europe/London", "Europe/Berlin"),
    ).toBe("Pacific/Auckland");
  });
});
