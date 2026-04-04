import { describe, expect, it } from "vitest";
import {
  formatAppointmentDateNumericRu,
  formatAppointmentTimeShortRu,
  formatBookingDateLongRu,
  formatBookingDateTimeMediumRu,
  formatBookingTimeShortRu,
  formatDoctorAppointmentRecordAt,
  parseBusinessInstant,
} from "./formatBusinessDateTime";

describe("formatBusinessDateTime", () => {
  const msk = "Europe/Moscow";
  const samara = "Europe/Samara";

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

  it("parseBusinessInstant treats naive ISO as wall time in display timezone (Moscow)", () => {
    const d = parseBusinessInstant("2026-04-10T10:00:00", msk);
    expect(d.toISOString()).toBe("2026-04-10T07:00:00.000Z");
  });

  it("parseBusinessInstant treats naive ISO as wall time in display timezone (Samara)", () => {
    const d = parseBusinessInstant("2026-04-10T10:00:00", samara);
    expect(d.toISOString()).toBe("2026-04-10T06:00:00.000Z");
  });

  it("parseBusinessInstant yields different UTC instants for Moscow and Samara naive wall time", () => {
    const moscow = parseBusinessInstant("2026-04-10T10:00:00", msk);
    const sam = parseBusinessInstant("2026-04-10T10:00:00", samara);
    expect(moscow.toISOString()).toBe("2026-04-10T07:00:00.000Z");
    expect(sam.toISOString()).toBe("2026-04-10T06:00:00.000Z");
  });

  it("parseBusinessInstant leaves explicit Z unchanged", () => {
    const d = parseBusinessInstant("2026-04-10T07:00:00.000Z", msk);
    expect(d.toISOString()).toBe("2026-04-10T07:00:00.000Z");
  });

  it("parseBusinessInstant leaves explicit offset unchanged", () => {
    const d = parseBusinessInstant("2026-04-10T10:00:00+03:00", samara);
    expect(d.toISOString()).toBe("2026-04-10T07:00:00.000Z");
  });

  it("formatAppointmentDateNumericRu and formatAppointmentTimeShortRu align with formatDoctorAppointmentRecordAt (MSK)", () => {
    const iso = "2026-04-02T14:00:00.000Z";
    expect(formatAppointmentTimeShortRu(iso, msk)).toBe(formatBookingTimeShortRu(iso, msk));
    expect(formatAppointmentTimeShortRu(iso, msk)).toMatch(/^17:00$/);
    expect(formatDoctorAppointmentRecordAt(iso, msk)).toBe("17:00 02.04");
    const dateRu = formatAppointmentDateNumericRu(iso, msk);
    expect(dateRu).toContain("2026");
    expect(dateRu).toContain("4");
    expect(dateRu).toContain("2");
  });

  it("formatAppointmentTimeShortRu returns em dash for invalid input", () => {
    expect(formatAppointmentTimeShortRu("", msk)).toBe("—");
  });
});
