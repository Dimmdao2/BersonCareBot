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
            type: "Консультация",
            status: "подтверждена",
            link: null,
            cancellationCountForClient: 0,
            branchName: null,
          },
        ];
      }
      return [];
    },
    async getAppointmentStats(filter) {
      return {
        total: filter.range === "today" ? 1 : 0,
        cancellations: 0,
        cancellations30d: 2,
        reschedules: 0,
      };
    },
    async getDashboardAppointmentMetrics() {
      return {
        futureActiveCount: 0,
        recordsInCalendarMonthTotal: 0,
        cancellationsInCalendarMonth: 0,
      };
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
            type: "Сеанс",
            status: "created",
            link: null,
            cancellationCountForClient: 0,
            branchName: null,
          },
        ];
      },
      async getAppointmentStats() {
        return { total: 0, cancellations: 0, cancellations30d: 0, reschedules: 0 };
      },
      async getDashboardAppointmentMetrics() {
        return { futureActiveCount: 0, recordsInCalendarMonthTotal: 0, cancellationsInCalendarMonth: 0 };
      },
    };

    const svc = createDoctorAppointmentsService({ appointmentsPort: portWithIso });
    const list = await svc.listAppointmentsForSpecialist({ kind: "range", range: "today" });
    expect(list).toHaveLength(1);
    expect(list[0].time).toBe("10:00 15.01");
  });

  it("getAppointmentStats returns port result", async () => {
    const stats = await service.getAppointmentStats({ range: "today" });
    expect(stats.total).toBe(1);
    expect(stats.cancellations30d).toBe(2);
  });
});
