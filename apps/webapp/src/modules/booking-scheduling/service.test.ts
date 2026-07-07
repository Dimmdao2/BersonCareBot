import { describe, expect, it } from "vitest";
import { buildSlotsForContext } from "./service";
import type { BookingSchedulingPort, WorkingDayRecord } from "./ports";

/** Дата ~30 дней в будущем (минует min-notice фильтр), YYYY-MM-DD в UTC. */
const TEST_DATE = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const TEST_WEEKDAY = new Date(`${TEST_DATE}T12:00:00.000Z`).getUTCDay();

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
    listWorkingHours: async () => [{ weekday: TEST_WEEKDAY, startMinute: 9 * 60, endMinute: 18 * 60 }],
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
    bufferAfterMinutes: 0,
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

  it("uses the manual per-date schedule instead of the weekday default for matching branch slots", async () => {
    const slots = await buildSlotsForContext(makePort("branch-A"), context("branch-A"));
    const firstSlot = slots.flatMap((d) => d.slots)[0];
    expect(firstSlot?.startAt).toBeDefined();
    expect(new Date(firstSlot!.startAt).getUTCHours()).toBe(11);
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

describe("buildSlotsForContext service buffer after appointment", () => {
  it("keeps displayed slot duration but requires the after-appointment buffer to fit", async () => {
    const slots = await buildSlotsForContext(makePort(null), {
      ...context("branch-A"),
      durationMinutes: 60,
      bufferAfterMinutes: 30,
    });
    const flat = slots.flatMap((d) => d.slots);
    const lastSlot = flat.at(-1);

    expect(lastSlot?.startAt).toBeDefined();
    expect(new Date(lastSlot!.startAt).getUTCHours()).toBe(17);
    expect(new Date(lastSlot!.startAt).getUTCMinutes()).toBe(0);
    expect(new Date(lastSlot!.endAt).getUTCHours()).toBe(18);
    expect(new Date(lastSlot!.endAt).getUTCMinutes()).toBe(0);
  });

  it("does not offer a slot inside another appointment's after-appointment buffer", async () => {
    const port = {
      ...makePort(null),
      listBusyIntervals: async () => [
        {
          startAt: `${TEST_DATE}T12:00:00.000Z`,
          endAt: `${TEST_DATE}T13:30:00.000Z`,
        },
      ],
    } as unknown as BookingSchedulingPort;
    const slots = await buildSlotsForContext(port, context("branch-A"));
    const flat = slots.flatMap((d) => d.slots);

    expect(flat.some((slot) => slot.startAt === `${TEST_DATE}T13:00:00.000Z`)).toBe(false);
    expect(flat.some((slot) => slot.startAt === `${TEST_DATE}T13:30:00.000Z`)).toBe(true);
  });
});
