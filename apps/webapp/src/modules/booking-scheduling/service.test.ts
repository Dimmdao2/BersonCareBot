import { describe, expect, it } from "vitest";
import { buildSlotsForContext } from "./service";
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
    breakStartMinute: null,
    breakEndMinute: null,
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
