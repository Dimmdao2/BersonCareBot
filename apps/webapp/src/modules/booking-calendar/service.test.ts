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
        rubitimeId: null,
        rubitimeManageUrl: null,
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
    resolveSchedulingForSlots: vi.fn(async () => null),
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
    resolveLegacyBranchServiceId: vi.fn(),
    listServicesByCityCode: vi.fn(),
    getSlots: vi.fn(async () => []),
    listBusyIntervals: vi.fn(),
    listWorkingHours: vi.fn(async () => [
      { weekday: 6, startMinute: 9 * 60, endMinute: 12 * 60 },
      { weekday: 6, startMinute: 13 * 60, endMinute: 18 * 60 },
    ]),
    getBufferMinutes: vi.fn(),
    listScheduleBlocks: vi.fn(),
    createScheduleBlock: vi.fn(),
    deleteScheduleBlock: vi.fn(),
    listWorkingHoursAdmin: vi.fn(),
    createWorkingHours: vi.fn(),
    updateWorkingHours: vi.fn(),
    deactivateWorkingHours: vi.fn(),
    upsertBufferMinutes: vi.fn(),
    getMinNoticeHours: vi.fn(async () => 0),
    // per-date stubs
    listWorkingDays: vi.fn(async () => []),
    upsertWorkingDays: vi.fn(async () => []),
    closeWorkingDays: vi.fn(async () => []),
    clearWorkingDays: vi.fn(async () => undefined),
    listScheduleTemplates: vi.fn(async () => []),
    createScheduleTemplate: vi.fn(),
    deleteScheduleTemplate: vi.fn(),
    nearestFreeWindow: vi.fn(async () => null),
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
      timeZone: "Europe/Moscow",
      specialistId: "s1",
      branchId: "b1",
    });
    expect(result.events.some((e) => e.kind === "appointment")).toBe(true);
    expect(result.events.some((e) => e.kind === "block")).toBe(true);
    expect(result.events.some((e) => e.kind === "working")).toBe(true);
    expect(result.events.some((e) => e.kind === "break")).toBe(true);
    expect(result.filters.services).toHaveLength(1);
    expect(result.readSource).toBe("canonical");
    expect(result.showWorkingHours).toBe(true);
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
      timeZone: "Europe/Moscow",
      branchId: "b1",
    });
    expect(result.events.filter((e) => e.kind === "block")).toHaveLength(0);
  });

  it("hides working and break layers when setting is disabled", async () => {
    const noBgService = createBookingCalendarService({
      calendarPort: mockPort,
      listScheduleBlocks,
      schedulingPort,
      resolveShowWorkingHours: async () => false,
    });
    const result = await noBgService.getCalendar({
      organizationId: "org1",
      rangeStart: "2026-05-30T00:00:00.000Z",
      rangeEnd: "2026-05-31T00:00:00.000Z",
      timeZone: "Europe/Moscow",
      specialistId: "s1",
      branchId: "b1",
    });
    expect(result.events.some((e) => e.kind === "working")).toBe(false);
    expect(result.events.some((e) => e.kind === "break")).toBe(false);
    expect(result.events.some((e) => e.kind === "appointment")).toBe(true);
    expect(result.events.some((e) => e.kind === "block")).toBe(true);
    expect(result.showWorkingHours).toBe(false);
  });
});
