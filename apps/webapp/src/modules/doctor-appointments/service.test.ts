import { describe, expect, it, vi } from "vitest";
import { createDoctorAppointmentsService } from "./service";
import type { DoctorAppointmentsPort } from "./ports";

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: vi.fn(async () => "Europe/Moscow"),
}));

describe("doctor-appointments service", () => {
  const mockPort: DoctorAppointmentsPort = {
    async listAppointmentsForSpecialist(filter) {
      if (filter.kind === "range" && filter.range === "today") {
        return [
          {
            id: "apt-1",
            clientUserId: "user-1",
            clientLabel: "Иван",
            time: "10:00",
            recordAtIso: null,
            dateKey: "",
            type: "Консультация",
            status: "подтверждена",
            link: null,
            cancellationCountForClient: 0,
            branchName: null,
            rubitimeNameIfDifferent: null,
          },
        ];
      }
      return [];
    },
    async getAppointmentStats(filter) {
      return {
        pastVisitsInPeriod: 0,
        cancelledVisitsInPeriod: 0,
        bookingsCreatedInPeriod: 0,
        cancellationActionsInPeriod: 0,
        rescheduleActionsInPeriod: 0,
        total: filter.kind === "range" && filter.range === "today" ? 1 : 0,
        cancellations30d: 2,
      };
    },
    async getDashboardAppointmentMetrics() {
      return {
        futureActiveCount: 0,
        recordsInCalendarMonthTotal: 0,
        cancellationsInCalendarMonth: 0,
      };
    },
    async getScheduleKpis() {
      return {
        recordsInPeriod: 0,
        pastInPeriod: 0,
        futureInPeriod: 0,
        bySubscriptionInPeriod: 0,
        firstVisitInPeriod: 0,
        repeatVisitInPeriod: 0,
        uniquePatientsInPeriod: 0,
        cancellationsInPeriod: 0,
        reschedulesInPeriod: 0,
      };
    },
    async getAppointmentDailySeries() {
      return { daySeries: [], branchSeries: [] };
    },
  };

  const service = createDoctorAppointmentsService({ appointmentsPort: mockPort });

  it("listAppointmentsForSpecialist returns port result", async () => {
    const list = await service.listAppointmentsForSpecialist({ kind: "range", range: "today" });
    expect(list).toHaveLength(1);
    expect(list[0].clientLabel).toBe("Иван");
    expect(list[0].time).toBe("10:00");
  });

  it("listAppointmentsForSpecialist returns empty for tomorrow", async () => {
    const list = await service.listAppointmentsForSpecialist({ kind: "range", range: "tomorrow" });
    expect(list).toHaveLength(0);
  });

  it("listAppointmentsForSpecialist formats time from recordAtIso in business timezone", async () => {
    const portWithIso: DoctorAppointmentsPort = {
      async listAppointmentsForSpecialist() {
        return [
          {
            id: "apt-2",
            clientUserId: "user-2",
            clientLabel: "Пётр",
            time: "",
            recordAtIso: "2026-01-15T07:00:00.000Z",
            dateKey: "",
            type: "Сеанс",
            status: "created",
            link: null,
            cancellationCountForClient: 0,
            branchName: null,
            rubitimeNameIfDifferent: null,
          },
        ];
      },
      async getAppointmentStats() {
        return {
          pastVisitsInPeriod: 0,
          cancelledVisitsInPeriod: 0,
          bookingsCreatedInPeriod: 0,
          cancellationActionsInPeriod: 0,
          rescheduleActionsInPeriod: 0,
          total: 0,
          cancellations30d: 0,
        };
      },
      async getDashboardAppointmentMetrics() {
        return { futureActiveCount: 0, recordsInCalendarMonthTotal: 0, cancellationsInCalendarMonth: 0 };
      },
      async getScheduleKpis() {
        return { recordsInPeriod: 0, pastInPeriod: 0, futureInPeriod: 0, bySubscriptionInPeriod: 0, firstVisitInPeriod: 0, repeatVisitInPeriod: 0, uniquePatientsInPeriod: 0, cancellationsInPeriod: 0, reschedulesInPeriod: 0 };
      },
      async getAppointmentDailySeries() {
        return { daySeries: [], branchSeries: [] };
      },
    };

    const svc = createDoctorAppointmentsService({ appointmentsPort: portWithIso });
    const list = await svc.listAppointmentsForSpecialist({ kind: "range", range: "today" });
    expect(list).toHaveLength(1);
    expect(list[0].time).toBe("10:00 15.01");
  });

  it("listAppointmentsForSpecialist sets dateKey from recordAtIso in business timezone", async () => {
    const portWithIso: DoctorAppointmentsPort = {
      async listAppointmentsForSpecialist() {
        return [
          {
            id: "apt-3",
            clientUserId: "user-3",
            clientLabel: "Мария",
            time: "",
            recordAtIso: "2026-01-15T07:00:00.000Z",
            dateKey: "",
            type: "Сеанс",
            status: "created",
            link: null,
            cancellationCountForClient: 0,
            branchName: null,
            rubitimeNameIfDifferent: null,
          },
        ];
      },
      async getAppointmentStats() {
        return {
          pastVisitsInPeriod: 0,
          cancelledVisitsInPeriod: 0,
          bookingsCreatedInPeriod: 0,
          cancellationActionsInPeriod: 0,
          rescheduleActionsInPeriod: 0,
          total: 0,
          cancellations30d: 0,
        };
      },
      async getDashboardAppointmentMetrics() {
        return { futureActiveCount: 0, recordsInCalendarMonthTotal: 0, cancellationsInCalendarMonth: 0 };
      },
      async getScheduleKpis() {
        return { recordsInPeriod: 0, pastInPeriod: 0, futureInPeriod: 0, bySubscriptionInPeriod: 0, firstVisitInPeriod: 0, repeatVisitInPeriod: 0, uniquePatientsInPeriod: 0, cancellationsInPeriod: 0, reschedulesInPeriod: 0 };
      },
      async getAppointmentDailySeries() {
        return { daySeries: [], branchSeries: [] };
      },
    };

    const svc = createDoctorAppointmentsService({ appointmentsPort: portWithIso });
    const list = await svc.listAppointmentsForSpecialist({ kind: "range", range: "today" });
    expect(list).toHaveLength(1);
    // 2026-01-15T07:00:00.000Z = 2026-01-15 10:00 в Europe/Moscow (UTC+3)
    expect(list[0].dateKey).toBe("2026-01-15");
  });

  it("listAppointmentsForSpecialist sets empty dateKey when recordAtIso is null", async () => {
    const list = await service.listAppointmentsForSpecialist({ kind: "range", range: "today" });
    expect(list[0].dateKey).toBe("");
  });

  it("getAppointmentStats returns port result", async () => {
    const stats = await service.getAppointmentStats({ kind: "range", range: "today" });
    expect(stats.total).toBe(1);
    expect(stats.cancellations30d).toBe(2);
  });
});

describe("doctor-appointments service — getScheduleKpis invariants", () => {
  // Helper to build a port that returns specific KPI values
  function buildPortWithKpis(kpis: import("@/modules/doctor-appointments/ports").ScheduleKpis): import("@/modules/doctor-appointments/ports").DoctorAppointmentsPort {
    return {
      listAppointmentsForSpecialist: async () => [],
      getAppointmentStats: async () => ({
        pastVisitsInPeriod: 0, cancelledVisitsInPeriod: 0, bookingsCreatedInPeriod: 0,
        cancellationActionsInPeriod: 0, rescheduleActionsInPeriod: 0, total: 0, cancellations30d: 0,
      }),
      getDashboardAppointmentMetrics: async () => ({
        futureActiveCount: 0, recordsInCalendarMonthTotal: 0, cancellationsInCalendarMonth: 0,
      }),
      getScheduleKpis: async () => kpis,
      getAppointmentDailySeries: async () => ({ daySeries: [], branchSeries: [] }),
    };
  }

  it("инвариант past + future = records", async () => {
    const kpis = {
      recordsInPeriod: 9,
      pastInPeriod: 2,
      futureInPeriod: 7,
      bySubscriptionInPeriod: 1,
      firstVisitInPeriod: 1,
      repeatVisitInPeriod: 8,
      uniquePatientsInPeriod: 5,
      cancellationsInPeriod: 3,
      reschedulesInPeriod: 2,
    };
    expect(kpis.pastInPeriod + kpis.futureInPeriod).toBe(kpis.recordsInPeriod);
  });

  it("инвариант first + repeat = records", async () => {
    const kpis = {
      recordsInPeriod: 9,
      pastInPeriod: 2,
      futureInPeriod: 7,
      bySubscriptionInPeriod: 1,
      firstVisitInPeriod: 1,
      repeatVisitInPeriod: 8,
      uniquePatientsInPeriod: 5,
      cancellationsInPeriod: 3,
      reschedulesInPeriod: 2,
    };
    expect(kpis.firstVisitInPeriod + kpis.repeatVisitInPeriod).toBe(kpis.recordsInPeriod);
  });

  it("нули как нули: getScheduleKpis с нулями возвращает 0", async () => {
    const zeroKpis = {
      recordsInPeriod: 0,
      pastInPeriod: 0,
      futureInPeriod: 0,
      bySubscriptionInPeriod: 0,
      firstVisitInPeriod: 0,
      repeatVisitInPeriod: 0,
      uniquePatientsInPeriod: 0,
      cancellationsInPeriod: 0,
      reschedulesInPeriod: 0,
    };
    const svc = createDoctorAppointmentsService({ appointmentsPort: buildPortWithKpis(zeroKpis) });
    const result = await svc.getScheduleKpis({ from: "2026-06-01T00:00:00", to: "2026-06-04T00:00:00" });
    expect(result.recordsInPeriod).toBe(0);
    expect(result.pastInPeriod).toBe(0);
    expect(result.futureInPeriod).toBe(0);
    expect(result.firstVisitInPeriod).toBe(0);
    expect(result.repeatVisitInPeriod).toBe(0);
    expect(result.pastInPeriod + result.futureInPeriod).toBe(result.recordsInPeriod);
    expect(result.firstVisitInPeriod + result.repeatVisitInPeriod).toBe(result.recordsInPeriod);
  });

  it("сервис прокидывает query и audience в порт без изменений", async () => {
    const mockKpis = {
      recordsInPeriod: 5,
      pastInPeriod: 3,
      futureInPeriod: 2,
      bySubscriptionInPeriod: 1,
      firstVisitInPeriod: 2,
      repeatVisitInPeriod: 3,
      uniquePatientsInPeriod: 4,
      cancellationsInPeriod: 1,
      reschedulesInPeriod: 0,
    };
    const spy = vi.fn().mockResolvedValue(mockKpis);
    const port = buildPortWithKpis(mockKpis);
    port.getScheduleKpis = spy;
    const svc = createDoctorAppointmentsService({ appointmentsPort: port });

    const query = { from: "2026-06-01T00:00:00", to: "2026-06-04T00:00:00", branchId: "branch-1" };
    const audience = { excludedUserIds: ["user-x"] };
    await svc.getScheduleKpis(query, audience);

    expect(spy).toHaveBeenCalledWith(query, audience);
  });
});
