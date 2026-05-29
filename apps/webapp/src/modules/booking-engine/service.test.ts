import { describe, expect, it, vi } from "vitest";
import { createBookingEngineService } from "./service";
import type { BookingEngineBundlePort } from "./ports";
import type { BeAppointment } from "./types";

function mockPort(overrides: Partial<BookingEngineBundlePort> = {}): BookingEngineBundlePort {
  const appointment: BeAppointment = {
    id: "11111111-1111-4111-8111-111111111111",
    organizationId: "a0000000-0000-4000-8000-000000000001",
    branchId: null,
    roomId: null,
    specialistId: null,
    serviceId: null,
    platformUserId: null,
    startAt: "2026-06-01T10:00:00.000Z",
    endAt: "2026-06-01T11:00:00.000Z",
    durationMinutes: 60,
    source: "native",
    status: "created",
    originalStartAt: "2026-06-01T10:00:00.000Z",
    rescheduleCount: 0,
    paymentRef: null,
    packageUsageRef: null,
    phoneNormalized: null,
  };
  return {
    getDefaultOrganizationId: vi.fn().mockResolvedValue("a0000000-0000-4000-8000-000000000001"),
    getOrganization: vi.fn(),
    listOrganizations: vi.fn().mockResolvedValue([]),
    upsertOrganization: vi.fn(),
    listBranches: vi.fn().mockResolvedValue([]),
    getBranch: vi.fn(),
    upsertBranch: vi.fn(),
    deactivateBranch: vi.fn(),
    listRooms: vi.fn().mockResolvedValue([]),
    getRoom: vi.fn(),
    upsertRoom: vi.fn(),
    deactivateRoom: vi.fn(),
    listSpecialists: vi.fn().mockResolvedValue([]),
    getSpecialist: vi.fn(),
    upsertSpecialist: vi.fn(),
    deactivateSpecialist: vi.fn(),
    setSpecialistLocation: vi.fn(),
    setSpecialistRoom: vi.fn(),
    listSpecialistRooms: vi.fn().mockResolvedValue([]),
    listServices: vi.fn().mockResolvedValue([]),
    getService: vi.fn(),
    upsertService: vi.fn(),
    deactivateService: vi.fn(),
    upsertSpecialistServiceAvailability: vi.fn(),
    listSpecialistServiceAvailability: vi.fn().mockResolvedValue([]),
    deactivateSpecialistServiceAvailability: vi.fn(),
    upsertServiceLocationAvailability: vi.fn(),
    listServiceLocationAvailability: vi.fn().mockResolvedValue([]),
    getAppointment: vi.fn().mockResolvedValue(appointment),
    createAppointment: vi.fn().mockResolvedValue(appointment),
    transitionAppointmentStatus: vi
      .fn()
      .mockImplementation(async (input) => ({ ...appointment, status: input.toStatus })),
    isBridgeEnabled: vi.fn().mockResolvedValue(true),
    projectAppointmentRecords: vi.fn().mockResolvedValue({ projectedAppointments: 0, skippedExisting: 0 }),
    projectRubitimeRecords: vi.fn().mockResolvedValue({ projectedAppointments: 0, skippedExisting: 0 }),
    getMappingSummary: vi.fn().mockResolvedValue({
      branches: 0,
      specialists: 0,
      services: 0,
      availabilities: 0,
      appointments: 0,
    }),
    ...overrides,
  };
}

describe("createBookingEngineService", () => {
  it("createAppointment defaults status to created", async () => {
    const port = mockPort();
    const svc = createBookingEngineService(port);
    await svc.createAppointment({
      organizationId: "a0000000-0000-4000-8000-000000000001",
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
      durationMinutes: 60,
      source: "native",
    });
    expect(port.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ status: "created" }),
    );
  });

  it("transitionAppointmentStatus rejects invalid FSM", async () => {
    const port = mockPort({
      getAppointment: vi.fn().mockResolvedValue({
        id: "11111111-1111-4111-8111-111111111111",
        organizationId: "a0000000-0000-4000-8000-000000000001",
        branchId: null,
        roomId: null,
        specialistId: null,
        serviceId: null,
        platformUserId: null,
        startAt: "2026-06-01T10:00:00.000Z",
        endAt: "2026-06-01T11:00:00.000Z",
        durationMinutes: 60,
        source: "native",
        status: "completed",
        originalStartAt: null,
        rescheduleCount: 0,
        paymentRef: null,
        packageUsageRef: null,
        phoneNormalized: null,
      }),
    });
    const svc = createBookingEngineService(port);
    await expect(
      svc.transitionAppointmentStatus({
        appointmentId: "11111111-1111-4111-8111-111111111111",
        toStatus: "confirmed",
      }),
    ).rejects.toThrow(/Недопустимый переход/);
  });

  it("bridge.projectAll skips when disabled", async () => {
    const port = mockPort({ isBridgeEnabled: vi.fn().mockResolvedValue(false) });
    const svc = createBookingEngineService(port);
    const result = await svc.bridge.projectAll("a0000000-0000-4000-8000-000000000001");
    expect(result.appointmentRecords.projectedAppointments).toBe(0);
    expect(port.projectAppointmentRecords).not.toHaveBeenCalled();
  });
});
