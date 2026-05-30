import { describe, expect, it, vi, beforeEach } from "vitest";
import { createBookingCalendarService } from "./service";
import type { BookingCalendarPort } from "./ports";
import type { BookingSchedulingPort } from "@/modules/booking-scheduling/ports";

describe("booking-calendar service", () => {
  const mockPort: BookingCalendarPort = {
    listAppointmentsInRange: vi.fn(async () => [
      {
        kind: "appointment" as const,
        id: "a1",
        startAt: "2026-05-30T08:00:00.000Z",
        endAt: "2026-05-30T09:00:00.000Z",
        status: "confirmed" as const,
        source: "native",
        specialistId: "s1",
        specialistName: "Доктор",
        branchId: "b1",
        branchTitle: "Филиал",
        roomId: null,
        roomTitle: null,
        serviceId: "svc1",
        serviceTitle: "Приём",
        platformUserId: null,
        patientName: "Иван",
        patientPhone: "+79001234567",
        bookingStatus: "confirmed",
        paymentStatus: null,
        prepaymentPending: false,
        packageUsageRef: null,
        packageTitle: null,
        rescheduleCount: 0,
        originalStartAt: null,
        formComments: [],
      },
    ]),
    listFilterMeta: vi.fn(async () => ({
      specialists: [{ id: "s1", label: "Доктор" }],
      branches: [{ id: "b1", label: "Филиал" }],
      rooms: [],
      services: [{ id: "svc1", label: "Приём", durationMinutes: 60 }],
    })),
    resolveSchedulingForSlots: vi.fn(async () => ({
      durationMinutes: 60,
      roomId: null,
      branchTimezone: "Europe/Moscow",
    })),
  };

  const listScheduleBlocks = vi.fn(async () => [
    {
      id: "blk1",
      organizationId: "org1",
      specialistId: "s1",
      branchId: "b1",
      roomId: null,
      startAt: "2026-05-30T10:00:00.000Z",
      endAt: "2026-05-30T11:00:00.000Z",
      blockType: "block",
      title: "Обед",
    },
  ]);

  const schedulingPort: BookingSchedulingPort = {
    resolveCanonicalFromBranchService: vi.fn(),
    listServicesByCityCode: vi.fn(),
    getSlots: vi.fn(async () => [
      {
        date: "2026-05-30",
        slots: [{ startAt: "2026-05-30T11:00:00.000Z", endAt: "2026-05-30T12:00:00.000Z" }],
      },
    ]),
    listBusyIntervals: vi.fn(),
    listWorkingHours: vi.fn(),
    getBufferMinutes: vi.fn(),
    listScheduleBlocks: vi.fn(),
    createScheduleBlock: vi.fn(),
    deleteScheduleBlock: vi.fn(),
    listWorkingHoursAdmin: vi.fn(),
    createWorkingHours: vi.fn(),
    updateWorkingHours: vi.fn(),
    deactivateWorkingHours: vi.fn(),
  };

  const service = createBookingCalendarService({
    calendarPort: mockPort,
    listScheduleBlocks,
    schedulingPort,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges appointments and filtered schedule blocks", async () => {
    const result = await service.getCalendar({
      organizationId: "org1",
      rangeStart: "2026-05-30T00:00:00.000Z",
      rangeEnd: "2026-05-31T00:00:00.000Z",
      specialistId: "s1",
    });
    expect(result.events).toHaveLength(2);
    expect(result.events.some((e) => e.kind === "appointment")).toBe(true);
    expect(result.events.some((e) => e.kind === "block")).toBe(true);
    expect(result.filters.services).toHaveLength(1);
    expect(result.readSource).toBe("canonical");
    expect(result.freeSlotsEnabled).toBe(true);
  });

  it("filters blocks by branch", async () => {
    listScheduleBlocks.mockResolvedValueOnce([
      {
        id: "blk2",
        organizationId: "org1",
        specialistId: "s1",
        branchId: "other",
        roomId: null,
        startAt: "2026-05-30T12:00:00.000Z",
        endAt: "2026-05-30T13:00:00.000Z",
        blockType: "block",
        title: "Skip",
      },
    ]);
    const result = await service.getCalendar({
      organizationId: "org1",
      rangeStart: "2026-05-30T00:00:00.000Z",
      rangeEnd: "2026-05-31T00:00:00.000Z",
      branchId: "b1",
    });
    expect(result.events.filter((e) => e.kind === "block")).toHaveLength(0);
  });

  it("includes free slots when filters and includeFreeSlots set", async () => {
    const result = await service.getCalendar({
      organizationId: "org1",
      rangeStart: "2026-05-30T00:00:00.000Z",
      rangeEnd: "2026-05-31T00:00:00.000Z",
      specialistId: "s1",
      branchId: "b1",
      serviceId: "svc1",
      includeFreeSlots: true,
    });
    expect(result.events.some((e) => e.kind === "freeSlot")).toBe(true);
    expect(schedulingPort.getSlots).toHaveBeenCalled();
  });

  it("skips free slots when read source is rubitime_legacy", async () => {
    const isolatedScheduling: BookingSchedulingPort = {
      resolveCanonicalFromBranchService: vi.fn(),
      listServicesByCityCode: vi.fn(),
      getSlots: vi.fn(async () => []),
      listBusyIntervals: vi.fn(),
      listWorkingHours: vi.fn(),
      getBufferMinutes: vi.fn(),
      listScheduleBlocks: vi.fn(),
      createScheduleBlock: vi.fn(),
      deleteScheduleBlock: vi.fn(),
      listWorkingHoursAdmin: vi.fn(),
      createWorkingHours: vi.fn(),
      updateWorkingHours: vi.fn(),
      deactivateWorkingHours: vi.fn(),
    };
    const isolatedRubitimeService = createBookingCalendarService({
      calendarPort: mockPort,
      listScheduleBlocks,
      schedulingPort: isolatedScheduling,
      resolveCalendarReadSource: async () => "rubitime_legacy",
    });
    const result = await isolatedRubitimeService.getCalendar({
      organizationId: "org1",
      rangeStart: "2026-05-30T00:00:00.000Z",
      rangeEnd: "2026-05-31T00:00:00.000Z",
      specialistId: "s1",
      branchId: "b1",
      serviceId: "svc1",
      includeFreeSlots: true,
    });
    expect(result.events.some((e) => e.kind === "freeSlot")).toBe(false);
    expect(result.freeSlotsEnabled).toBe(false);
    expect(result.readSource).toBe("rubitime_legacy");
    expect(isolatedScheduling.getSlots).not.toHaveBeenCalled();
  });
});
