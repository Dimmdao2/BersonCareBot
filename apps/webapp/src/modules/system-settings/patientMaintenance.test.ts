import { describe, expect, it } from "vitest";
import {
  DEFAULT_PATIENT_BOOKING_URL,
  DEFAULT_PATIENT_MAINTENANCE_MESSAGE,
  normalizePatientBookingUrl,
  normalizePatientMaintenanceMessage,
  patientMaintenanceReplacesPatientShell,
  patientMaintenanceSkipsPath,
} from "./patientMaintenance";

describe("patientMaintenance normalizers", () => {
  it("uses default message for empty/whitespace", () => {
    expect(normalizePatientMaintenanceMessage("")).toBe(DEFAULT_PATIENT_MAINTENANCE_MESSAGE);
    expect(normalizePatientMaintenanceMessage("   ")).toBe(DEFAULT_PATIENT_MAINTENANCE_MESSAGE);
  });

  it("trims non-empty message", () => {
    expect(normalizePatientMaintenanceMessage("  hello  ")).toBe("hello");
  });

  it("truncates overly long message", () => {
    const long = "a".repeat(600);
    expect(normalizePatientMaintenanceMessage(long).length).toBe(500);
  });

  it("normalizes booking URL", () => {
    expect(normalizePatientBookingUrl("")).toBe(DEFAULT_PATIENT_BOOKING_URL);
    expect(normalizePatientBookingUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(normalizePatientBookingUrl("not a url")).toBe(DEFAULT_PATIENT_BOOKING_URL);
    expect(normalizePatientBookingUrl("ftp://x")).toBe(DEFAULT_PATIENT_BOOKING_URL);
  });
});

describe("patientMaintenanceReplacesPatientShell", () => {
  it("requires maintenance enabled and path not skipped (caller must restrict to client role)", () => {
    expect(patientMaintenanceReplacesPatientShell(true, false)).toBe(true);
    expect(patientMaintenanceReplacesPatientShell(false, false)).toBe(false);
    expect(patientMaintenanceReplacesPatientShell(true, true)).toBe(false);
    expect(patientMaintenanceReplacesPatientShell(false, true)).toBe(false);
  });
});

describe("patientMaintenanceSkipsPath", () => {
  it("skips bind-phone, help, support", () => {
    expect(
      patientMaintenanceSkipsPath({
        pathname: "/app/patient/bind-phone",
        gate: "allow",
        legacyNoDatabase: false,
        sessionPhoneTrimmed: "+7999",
      }),
    ).toBe(true);
    expect(
      patientMaintenanceSkipsPath({
        pathname: "/app/patient/help/faq",
        gate: "allow",
        legacyNoDatabase: false,
        sessionPhoneTrimmed: "+7999",
      }),
    ).toBe(true);
  });

  it("skips activation allowlist when gate need_activation", () => {
    expect(
      patientMaintenanceSkipsPath({
        pathname: "/app/patient/sections/foo",
        gate: "need_activation",
        legacyNoDatabase: false,
        sessionPhoneTrimmed: undefined,
      }),
    ).toBe(true);
  });

  it("does not skip main patient home when gate allow", () => {
    expect(
      patientMaintenanceSkipsPath({
        pathname: "/app/patient",
        gate: "allow",
        legacyNoDatabase: false,
        sessionPhoneTrimmed: "+7999",
      }),
    ).toBe(false);
  });

  it("legacy no-db + no phone uses activation allowlist", () => {
    expect(
      patientMaintenanceSkipsPath({
        pathname: "/app/patient/bind-phone",
        gate: "need_activation",
        legacyNoDatabase: true,
        sessionPhoneTrimmed: undefined,
      }),
    ).toBe(true);
  });
});
