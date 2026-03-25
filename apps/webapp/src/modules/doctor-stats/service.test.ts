import { describe, expect, it, vi } from "vitest";
import { createDoctorStatsService } from "./service";

describe("doctor-stats service", () => {
  const service = createDoctorStatsService({
    getAppointmentStats: async (filter) => ({
      total: filter.range === "week" ? 5 : 0,
      cancellations: 1,
      cancellations30d: 2,
      reschedules: 0,
    }),
    listClients: async (filters) => {
      const all = [
        { userId: "u1", bindings: { telegramId: "tg1", maxId: "m1" } },
        { userId: "u2", bindings: { telegramId: "tg2" } },
        { userId: "u3", bindings: {} },
      ];
      if (filters.hasTelegram) return all.filter((c) => c.bindings.telegramId);
      if (filters.hasMax) return all.filter((c) => c.bindings.maxId);
      return all;
    },
    getDashboardPatientMetrics: async () => ({
      totalClients: 10,
      onSupportCount: 3,
      visitedThisCalendarMonthCount: 4,
    }),
    getDashboardAppointmentMetrics: async () => ({
      futureActiveCount: 7,
      recordsInCalendarMonthTotal: 12,
      cancellationsInCalendarMonth: 1,
    }),
  });

  it("getStats returns appointments and clients aggregates", async () => {
    const stats = await service.getStats();
    expect(stats.appointments.total).toBe(5);
    expect(stats.appointments.cancellations30d).toBe(2);
    expect(stats.clients.total).toBe(3);
    expect(stats.clients.withNoChannels).toBe(1);
    expect(stats.clients.withOneChannel).toBe(1);
    expect(stats.clients.withMultipleChannels).toBe(1);
  });

  it("getDashboardMetrics maps patient and appointment aggregates", async () => {
    const m = await service.getDashboardMetrics();
    expect(m.patients.total).toBe(10);
    expect(m.patients.onSupport).toBe(3);
    expect(m.patients.visitedThisMonth).toBe(4);
    expect(m.appointments.futureActive).toBe(7);
    expect(m.appointments.recordsInMonthTotal).toBe(12);
    expect(m.appointments.cancellationsInMonth).toBe(1);
  });

  it("getStats requests clients list only once", async () => {
    const listClients = vi.fn(async () => [
      { userId: "u1", bindings: { telegramId: "tg1", maxId: "m1" } },
      { userId: "u2", bindings: { telegramId: "tg2" } },
      { userId: "u3", bindings: {} },
    ]);
    const optimizedService = createDoctorStatsService({
      getAppointmentStats: async () => ({ total: 0, cancellations: 0, cancellations30d: 0, reschedules: 0 }),
      listClients,
      getDashboardPatientMetrics: async () => ({
        totalClients: 0,
        onSupportCount: 0,
        visitedThisCalendarMonthCount: 0,
      }),
      getDashboardAppointmentMetrics: async () => ({
        futureActiveCount: 0,
        recordsInCalendarMonthTotal: 0,
        cancellationsInCalendarMonth: 0,
      }),
    });

    await optimizedService.getStats();
    expect(listClients).toHaveBeenCalledTimes(1);
    expect(listClients).toHaveBeenCalledWith({});
  });
});
