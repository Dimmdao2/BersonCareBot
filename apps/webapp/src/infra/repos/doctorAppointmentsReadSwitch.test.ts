import { describe, expect, it, vi } from "vitest";
import {
  createDoctorAppointmentsReadSwitchPort,
  parseDoctorAppointmentsReadSource,
} from "./doctorAppointmentsReadSwitch";
import type { DoctorAppointmentsPort } from "@/modules/doctor-appointments/ports";

function mockPort(tag: string): DoctorAppointmentsPort {
  // Encode the port tag into recordsInPeriod so KPI routing is observable:
  // legacy -> 0 (mimics real legacy all-zero stub), canonical -> 37 (non-zero).
  const kpiRecords = tag === "canonical" ? 37 : 0;
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
      firstVisitInPeriod: 0,
      repeatVisitInPeriod: 0,
    })),
    getDashboardAppointmentMetrics: vi.fn(async () => ({
      futureActiveCount: 1,
      recordsInCalendarMonthTotal: 1,
      cancellationsInCalendarMonth: 0,
    })),
    getScheduleKpis: vi.fn(async () => ({
      recordsInPeriod: kpiRecords,
      pastInPeriod: 0,
      futureInPeriod: 0,
      bySubscriptionInPeriod: 0,
      firstVisitInPeriod: 0,
      firstVisitIds: [],
      repeatVisitInPeriod: 0,
      uniquePatientsInPeriod: 0,
      cancellationsInPeriod: 0,
      reschedulesInPeriod: 0,
    })),
    getAppointmentDailySeries: vi.fn(async () => ({ daySeries: [], branchSeries: [] })),
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

  // S2b (D1): KPI source is pinned to canonical regardless of the read-source flag,
  // because the legacy port's getScheduleKpis is an all-zero stub.
  const KPI_QUERY = { from: "2026-06-01T00:00:00+03:00", to: "2026-07-01T00:00:00+03:00" };

  it("getScheduleKpis uses canonical even when read-source is rubitime_legacy", async () => {
    const legacy = mockPort("legacy");
    const canonical = mockPort("canonical");
    const port = createDoctorAppointmentsReadSwitchPort({
      legacyPort: legacy,
      canonicalPort: canonical,
      resolveReadSource: async () => "rubitime_legacy",
    });
    const kpis = await port.getScheduleKpis(KPI_QUERY);
    // Non-zero => came from canonical, not the legacy all-zero stub.
    expect(kpis.recordsInPeriod).toBe(37);
    expect(canonical.getScheduleKpis).toHaveBeenCalled();
    expect(legacy.getScheduleKpis).not.toHaveBeenCalled();
  });

  it("getScheduleKpis still uses canonical when read-source is canonical", async () => {
    const legacy = mockPort("legacy");
    const canonical = mockPort("canonical");
    const port = createDoctorAppointmentsReadSwitchPort({
      legacyPort: legacy,
      canonicalPort: canonical,
      resolveReadSource: async () => "canonical",
    });
    const kpis = await port.getScheduleKpis(KPI_QUERY);
    expect(kpis.recordsInPeriod).toBe(37);
    expect(canonical.getScheduleKpis).toHaveBeenCalled();
    expect(legacy.getScheduleKpis).not.toHaveBeenCalled();
  });

  it("getScheduleKpis falls back to legacy when canonical port is missing", async () => {
    const legacy = mockPort("legacy");
    const port = createDoctorAppointmentsReadSwitchPort({
      legacyPort: legacy,
      canonicalPort: null,
      resolveReadSource: async () => "canonical",
    });
    const kpis = await port.getScheduleKpis(KPI_QUERY);
    expect(kpis.recordsInPeriod).toBe(0);
    expect(legacy.getScheduleKpis).toHaveBeenCalled();
  });

  it("getScheduleKpis does not affect routing of the other read-path methods", async () => {
    const legacy = mockPort("legacy");
    const canonical = mockPort("canonical");
    const port = createDoctorAppointmentsReadSwitchPort({
      legacyPort: legacy,
      canonicalPort: canonical,
      resolveReadSource: async () => "rubitime_legacy",
    });
    await port.getScheduleKpis(KPI_QUERY);
    // List/stats must still follow the flag (legacy by default) — no regression.
    const rows = await port.listAppointmentsForSpecialist({ kind: "futureActive" });
    expect(rows[0]?.id).toBe("legacy");
    expect(canonical.listAppointmentsForSpecialist).not.toHaveBeenCalled();
  });
});
