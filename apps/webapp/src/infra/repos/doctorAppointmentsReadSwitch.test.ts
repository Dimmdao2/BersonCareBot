import { describe, expect, it, vi } from "vitest";
import {
  createDoctorAppointmentsReadSwitchPort,
  parseDoctorAppointmentsReadSource,
} from "./doctorAppointmentsReadSwitch";
import type { DoctorAppointmentsPort } from "@/modules/doctor-appointments/ports";

function mockPort(tag: string): DoctorAppointmentsPort {
  return {
    listAppointmentsForSpecialist: vi.fn(async () => [{ id: tag, clientUserId: "", clientLabel: tag, time: "", recordAtIso: null, dateKey: "", type: "", status: "", link: null, cancellationCountForClient: 0, branchName: null, rubitimeNameIfDifferent: null }]),
    getAppointmentStats: vi.fn(async () => ({
      pastVisitsInPeriod: 0,
      cancelledVisitsInPeriod: 0,
      bookingsCreatedInPeriod: 0,
      cancellationActionsInPeriod: 0,
      rescheduleActionsInPeriod: 0,
      total: 1,
      cancellations30d: 0,
    })),
    getDashboardAppointmentMetrics: vi.fn(async () => ({
      futureActiveCount: 1,
      recordsInCalendarMonthTotal: 1,
      cancellationsInCalendarMonth: 0,
    })),
  };
}

describe("parseDoctorAppointmentsReadSource", () => {
  it("defaults to rubitime_legacy for unknown values", () => {
    expect(parseDoctorAppointmentsReadSource(undefined)).toBe("rubitime_legacy");
    expect(parseDoctorAppointmentsReadSource("hybrid")).toBe("rubitime_legacy");
  });

  it("accepts canonical", () => {
    expect(parseDoctorAppointmentsReadSource("canonical")).toBe("canonical");
    expect(parseDoctorAppointmentsReadSource({ value: "canonical" })).toBe("canonical");
  });
});

describe("createDoctorAppointmentsReadSwitchPort", () => {
  it("uses legacy port by default", async () => {
    const legacy = mockPort("legacy");
    const canonical = mockPort("canonical");
    const port = createDoctorAppointmentsReadSwitchPort({
      legacyPort: legacy,
      canonicalPort: canonical,
      resolveReadSource: async () => "rubitime_legacy",
    });
    const rows = await port.listAppointmentsForSpecialist({ kind: "futureActive" });
    expect(rows[0]?.id).toBe("legacy");
    expect(legacy.listAppointmentsForSpecialist).toHaveBeenCalled();
    expect(canonical.listAppointmentsForSpecialist).not.toHaveBeenCalled();
  });

  it("uses canonical when configured and port available", async () => {
    const legacy = mockPort("legacy");
    const canonical = mockPort("canonical");
    const port = createDoctorAppointmentsReadSwitchPort({
      legacyPort: legacy,
      canonicalPort: canonical,
      resolveReadSource: async () => "canonical",
    });
    const rows = await port.listAppointmentsForSpecialist({ kind: "futureActive" });
    expect(rows[0]?.id).toBe("canonical");
    expect(canonical.listAppointmentsForSpecialist).toHaveBeenCalled();
  });

  it("falls back to legacy when canonical requested but port missing", async () => {
    const legacy = mockPort("legacy");
    const port = createDoctorAppointmentsReadSwitchPort({
      legacyPort: legacy,
      canonicalPort: null,
      resolveReadSource: async () => "canonical",
    });
    const rows = await port.listAppointmentsForSpecialist({ kind: "futureActive" });
    expect(rows[0]?.id).toBe("legacy");
  });
});
