import { describe, expect, it } from "vitest";
import {
  formatBookingDateLongRu,
  formatBookingDateTimeMediumRu,
  formatBookingTimeShortRu,
  formatDoctorAppointmentRecordAt,
  parseBusinessInstant,
} from "./formatBusinessDateTime";

describe("formatBusinessDateTime", () => {
  const msk = "Europe/Moscow";

  it("formatBookingDateTimeMediumRu uses explicit time zone", () => {
    const s = formatBookingDateTimeMediumRu("2026-04-10T07:00:00.000Z", msk);
    expect(s).toMatch(/10:00/);
  });

  it("formatBookingTimeShortRu formats in MSK", () => {
    expect(formatBookingTimeShortRu("2026-04-10T07:00:00.000Z", msk)).toMatch(/10:00/);
  });

  it("formatBookingDateLongRu uses calendar day in zone", () => {
    const out = formatBookingDateLongRu("2026-04-10T07:00:00.000Z", msk);
    expect(out).toContain("2026");
    expect(out.toLowerCase()).toContain("апр");
  });

  it("formatDoctorAppointmentRecordAt matches HH:mm DD.MM", () => {
    expect(formatDoctorAppointmentRecordAt("2026-01-15T07:00:00.000Z", msk)).toBe("10:00 15.01");
  });

  it("formatDoctorAppointmentRecordAt returns empty for null", () => {
    expect(formatDoctorAppointmentRecordAt(null, msk)).toBe("");
  });

  it("parseBusinessInstant treats naive ISO as MSK wall when display zone is Moscow", () => {
    const d = parseBusinessInstant("2026-04-10T10:00:00", msk);
    expect(d.toISOString()).toBe("2026-04-10T07:00:00.000Z");
  });

  it("parseBusinessInstant leaves explicit Z unchanged", () => {
    const d = parseBusinessInstant("2026-04-10T07:00:00.000Z", msk);
    expect(d.toISOString()).toBe("2026-04-10T07:00:00.000Z");
  });
});
