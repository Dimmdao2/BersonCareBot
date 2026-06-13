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

  it("§3.13: per-date be_working_days override reaches the feed (with breaks)", async () => {
    // 2026-05-30 is a Saturday (weekday 6 → 09–12 + 13–18 from listWorkingHours).
    // Per-date row narrows to 10:00–16:00 with a single break 12:00–13:00.
    (schedulingPort.listWorkingDays as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "wd-1",
        organizationId: "org1",
        specialistId: "s1",
        branchId: "b1",
        roomId: null,
        workDate: "2026-05-30",
        startMinute: 10 * 60,
        endMinute: 16 * 60,
        breaks: [{ startMinute: 12 * 60, endMinute: 13 * 60 }],
        isClosed: false,
      },
    ]);
    const result = await service.getCalendar({
      organizationId: "org1",
      rangeStart: "2026-05-30T00:00:00.000Z",
      rangeEnd: "2026-05-31T00:00:00.000Z",
      timeZone: "Europe/Moscow",
      specialistId: "s1",
      branchId: "b1",
    });
    const working = result.events.filter((e) => e.kind === "working");
    const breaks = result.events.filter((e) => e.kind === "break");
    // Two working windows split by the per-date break, plus one break event.
    expect(working).toHaveLength(2);
    expect(breaks).toHaveLength(1);
    // Per-date window starts at 10:00 Moscow = 07:00Z (not the weekday 09:00 = 06:00Z).
    expect(working[0]!.startAt).toBe("2026-05-30T07:00:00.000Z");
    // Break is 12:00–13:00 Moscow = 09:00Z–10:00Z.
    expect(breaks[0]!.startAt).toBe("2026-05-30T09:00:00.000Z");
    expect(breaks[0]!.endAt).toBe("2026-05-30T10:00:00.000Z");
  });

  it("§3.13: weekday schedule is used when no per-date row exists (fallback)", async () => {
    // listWorkingDays default stub returns [] → weekday 09–12 + 13–18 fallback.
    const result = await service.getCalendar({
      organizationId: "org1",
      rangeStart: "2026-05-30T00:00:00.000Z",
      rangeEnd: "2026-05-31T00:00:00.000Z",
      timeZone: "Europe/Moscow",
      specialistId: "s1",
      branchId: "b1",
    });
    const working = result.events.filter((e) => e.kind === "working");
    // Weekday 09:00 Moscow = 06:00Z.
    expect(working.some((e) => e.startAt === "2026-05-30T06:00:00.000Z")).toBe(true);
  });

  it("§3.13: per-date row for a different branch reads as closed for queried branch", async () => {
    (schedulingPort.listWorkingDays as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        id: "wd-2",
        organizationId: "org1",
        specialistId: "s1",
        branchId: "other-branch",
        roomId: null,
        workDate: "2026-05-30",
        startMinute: 10 * 60,
        endMinute: 16 * 60,
        breaks: [],
        isClosed: false,
      },
    ]);
    const result = await service.getCalendar({
      organizationId: "org1",
      rangeStart: "2026-05-30T00:00:00.000Z",
      rangeEnd: "2026-05-31T00:00:00.000Z",
      timeZone: "Europe/Moscow",
      specialistId: "s1",
      branchId: "b1",
    });
    // Committed elsewhere → no working/break events for this branch that day.
    expect(result.events.some((e) => e.kind === "working")).toBe(false);
    expect(result.events.some((e) => e.kind === "break")).toBe(false);
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
