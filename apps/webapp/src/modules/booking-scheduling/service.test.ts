import { describe, expect, it } from "vitest";
import { buildSlotsForContext, createBookingSchedulingService } from "./service";
import type { BookingSchedulingPort, WorkingDayRecord } from "./ports";

/** Дата ~30 дней в будущем (минует min-notice фильтр), YYYY-MM-DD в UTC. */
const TEST_DATE = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

function makePort(perDayBranchId: string | null): BookingSchedulingPort {
  const workingDay: WorkingDayRecord = {
    id: "wd-1",
    organizationId: "org",
    specialistId: "spec",
    branchId: perDayBranchId,
    roomId: null,
    workDate: TEST_DATE,
    startMinute: 11 * 60,
    endMinute: 19 * 60,
    breaks: [],
    isClosed: false,
  };
  return {
    listWorkingHours: async () => [{ weekday: 0, startMinute: 0, endMinute: 0 }],
    getBufferMinutes: async () => 0,
    getMinNoticeHours: async () => 0,
    listBusyIntervals: async () => [],
    listWorkingDays: async () => [workingDay],
  } as unknown as BookingSchedulingPort;
}

function context(branchId: string | null) {
  return {
    organizationId: "org",
    branchId,
    specialistId: "spec",
    roomId: null,
    serviceId: "svc",
    durationMinutes: 60,
    branchTimezone: "UTC",
    dateFrom: TEST_DATE,
    dateTo: TEST_DATE,
  };
}

describe("buildSlotsForContext per-date branch scoping", () => {
  it("applies the per-date override when the assigned branch matches the queried branch", async () => {
    const slots = await buildSlotsForContext(makePort("branch-A"), context("branch-A"));
    const total = slots.reduce((n, d) => n + d.slots.length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("yields no slots when the day is assigned to a different branch", async () => {
    const slots = await buildSlotsForContext(makePort("branch-B"), context("branch-A"));
    const total = slots.reduce((n, d) => n + d.slots.length, 0);
    expect(total).toBe(0);
  });

  it("applies the override when the per-date row has no branch (location-agnostic)", async () => {
    const slots = await buildSlotsForContext(makePort(null), context("branch-A"));
    const total = slots.reduce((n, d) => n + d.slots.length, 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe("default slot horizon", () => {
  /** Ловит запрошенный диапазон, сами слоты не важны. */
  function capturingPort(captured: { dateFrom?: string; dateTo?: string }): BookingSchedulingPort {
    return {
      resolveCanonicalFromBranchService: async () => ({
        organizationId: "org",
        branchId: "branch-A",
        specialistId: "spec",
        serviceId: "svc",
        roomId: null,
        branchServiceId: "bs-1",
        durationMinutes: 60,
        branchTimezone: "UTC",
      }),
      getSlots: async (ctx: { dateFrom: string; dateTo: string }) => {
        captured.dateFrom = ctx.dateFrom;
        captured.dateTo = ctx.dateTo;
        return [];
      },
    } as unknown as BookingSchedulingPort;
  }

  function spanDays(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  }

  it("looks far enough ahead to reach next month for in-person slots", async () => {
    const captured: { dateFrom?: string; dateTo?: string } = {};
    const service = createBookingSchedulingService(capturingPort(captured));
    await service.getInPersonSlots({ branchServiceId: "bs-1", date: "2026-08-28" });
    expect(captured.dateFrom).toBe("2026-08-28");
    expect(spanDays(captured.dateFrom!, captured.dateTo!)).toBe(60);
  });

  it("looks far enough ahead to reach next month for online slots", async () => {
    const captured: { dateFrom?: string; dateTo?: string } = {};
    const service = createBookingSchedulingService(capturingPort(captured));
    await service.getOnlineSlots({
      organizationId: "org",
      category: "general",
      date: "2026-08-28",
      branchTimezone: "UTC",
    });
    expect(spanDays(captured.dateFrom!, captured.dateTo!)).toBe(60);
  });
});
