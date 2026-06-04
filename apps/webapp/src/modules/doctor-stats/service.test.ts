import { describe, expect, it, vi } from "vitest";
import { emptyClientContactBreakdown } from "@/modules/doctor-clients/clientContactSegments";
import { createDoctorStatsService } from "./service";

describe("doctor-stats service", () => {
  const contactBreakdown = {
    ...emptyClientContactBreakdown(),
    total: 3,
    phoneOnly: 1,
    appGuests: 1,
    pie: { ...emptyClientContactBreakdown().pie, telegram_only: 1 },
  };

  const service = createDoctorStatsService({
    getAppointmentStats: async (filter) => ({
      pastVisitsInPeriod: 4,
      cancelledVisitsInPeriod: 1,
      bookingsCreatedInPeriod: 6,
      cancellationActionsInPeriod: 2,
      rescheduleActionsInPeriod: 1,
      total: filter.kind === "range" && filter.range === "week" ? 5 : 0,
      cancellations30d: 2,
    }),
    getClientContactBreakdown: async () => contactBreakdown,
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
    countRecentClientsWithoutMessagingChannels: async () => 2,
  });

  it("getStats returns appointments and clients aggregates", async () => {
    const stats = await service.getStats();
    expect(stats.appointments.pastVisitsInPeriod).toBe(4);
    expect(stats.appointments.bookingsCreatedInPeriod).toBe(6);
    expect(stats.appointments.total).toBe(5);
    expect(stats.appointments.cancellations30d).toBe(2);
    expect(stats.clients.total).toBe(3);
    expect(stats.clients.phoneOnly).toBe(1);
    expect(stats.clients.appGuests).toBe(1);
    expect(stats.clients.contactBreakdown.pie.telegram_only).toBe(1);
    expect(stats.clients.newClients7dWithNoChannels).toBe(2);
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

  it("getStats requests contact breakdown only once", async () => {
    const getClientContactBreakdown = vi.fn(async () => contactBreakdown);
    const optimizedService = createDoctorStatsService({
      getAppointmentStats: async () => ({
        pastVisitsInPeriod: 0,
        cancelledVisitsInPeriod: 0,
        bookingsCreatedInPeriod: 0,
        cancellationActionsInPeriod: 0,
        rescheduleActionsInPeriod: 0,
        total: 0,
        cancellations30d: 0,
      }),
      getClientContactBreakdown,
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
      countRecentClientsWithoutMessagingChannels: async () => 2,
    });

    await optimizedService.getStats();
    expect(getClientContactBreakdown).toHaveBeenCalledTimes(1);
  });
});
