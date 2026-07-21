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
    attributionJson: {},
  };
  return {
    getDefaultOrganizationId: vi.fn().mockResolvedValue("a0000000-0000-4000-8000-000000000001"),
    getOrganization: vi.fn(),
    listOrganizations: vi.fn().mockResolvedValue([]),
    upsertOrganization: vi.fn(),
    listBranches: vi.fn().mockResolvedValue([]),
    getBranch: vi.fn(),
    upsertBranch: vi.fn(),
    createPhysicalBranchWithDefaultColor: vi.fn(),
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
    setSoloServiceLocationAvailability: vi.fn(),
    listServiceLocationAvailability: vi.fn().mockResolvedValue([]),
    getAppointment: vi.fn().mockResolvedValue(appointment),
    listAppointmentsByChainId: vi.fn().mockResolvedValue([]),
    createAppointmentChain: vi.fn().mockResolvedValue([appointment]),
    createOnlineAppointmentsIfAvailable: vi.fn().mockResolvedValue([appointment]),
    getStatusBeforePackageCharge: vi.fn().mockResolvedValue(null),
    createAppointment: vi.fn().mockResolvedValue(appointment),
    createManualPatientVisit: vi.fn().mockResolvedValue({
      kind: "scheduled",
      replayed: false,
      clinicalVisitId: null,
      portalStatus: "not_activated",
      appointment,
      patient: {
        userId: "22222222-2222-4222-8222-222222222222",
        displayName: "Пациент",
        lastName: "Пациент",
        firstName: "Тестовый",
        patronymic: null,
        phoneNormalized: "+79990000000",
        created: true,
      },
    }),
    transitionAppointmentStatus: vi
      .fn()
      .mockImplementation(async (input) => ({ ...appointment, status: input.toStatus })),
    isBridgeEnabled: vi.fn().mockResolvedValue(true),
    upsertCanonicalFromRubitimeRecord: vi.fn().mockResolvedValue({ action: "skipped_native_integrator_id" }),
    projectAppointmentRecords: vi.fn().mockResolvedValue({
      projectedAppointments: 0,
      updatedAppointments: 0,
      skippedExisting: 0,
      recoveredMappings: 0,
    }),
    getMappingSummary: vi.fn().mockResolvedValue({
      branches: 0,
      specialists: 0,
      services: 0,
      availabilities: 0,
      appointments: 0,
    }),
    upsertRubitimeAppointmentMapping: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createBookingEngineService", () => {
  it("resolves the configured palette for physical and Online creation independently", async () => {
    const port = mockPort({
      createPhysicalBranchWithDefaultColor: vi.fn().mockResolvedValue({ id: "physical" }),
      upsertBranch: vi.fn().mockResolvedValue({ id: "online", color: "#ABCDEF", isActive: true }),
    });
    const svc = createBookingEngineService(port, {
      getLocationPaletteSetting: vi.fn().mockResolvedValue({
        value: {
          physicalPalette: ["#111111", "#222222", "#333333", "#444444", "#555555"],
          online: "#abcdef",
        },
      }),
    });
    await svc.catalog.createPhysicalBranch({
      organizationId: "a0000000-0000-4000-8000-000000000001",
      title: "Москва",
      cityCode: "moscow",
      isActive: true,
      sortOrder: 10,
    });
    await svc.catalog.setOnlineLocationState({
      organizationId: "a0000000-0000-4000-8000-000000000001",
      isActive: true,
    });

    expect(port.createPhysicalBranchWithDefaultColor).toHaveBeenCalledWith(expect.objectContaining({
      physicalPalette: ["#111111", "#222222", "#333333", "#444444", "#555555"],
    }));
    expect(port.upsertBranch).toHaveBeenCalledWith(expect.objectContaining({ color: "#ABCDEF" }));
  });

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

  it("normalizes and forwards one consecutive online chain to the atomic port", async () => {
    const port = mockPort();
    const svc = createBookingEngineService(port);
    await svc.createOnlineAppointmentsIfAvailable([
      {
        organizationId: "a0000000-0000-4000-8000-000000000001",
        startAt: "2026-06-01T10:00:00Z",
        endAt: "2026-06-01T11:00:00Z",
        durationMinutes: 60,
        source: "native",
      },
      {
        organizationId: "a0000000-0000-4000-8000-000000000001",
        startAt: "2026-06-01T11:00:00Z",
        endAt: "2026-06-01T12:00:00Z",
        durationMinutes: 60,
        source: "native",
      },
    ]);
    expect(port.createOnlineAppointmentsIfAvailable).toHaveBeenCalledWith([
      expect.objectContaining({ startAt: "2026-06-01T10:00:00.000Z", status: "created" }),
      expect.objectContaining({ startAt: "2026-06-01T11:00:00.000Z", status: "created" }),
    ]);
  });

  it("rejects an online chain with a gap before reaching the port", async () => {
    const port = mockPort();
    const svc = createBookingEngineService(port);
    await expect(
      svc.createOnlineAppointmentsIfAvailable([
        {
          organizationId: "a0000000-0000-4000-8000-000000000001",
          startAt: "2026-06-01T10:00:00Z",
          endAt: "2026-06-01T11:00:00Z",
          durationMinutes: 60,
          source: "native",
        },
        {
          organizationId: "a0000000-0000-4000-8000-000000000001",
          startAt: "2026-06-01T12:00:00Z",
          endAt: "2026-06-01T13:00:00Z",
          durationMinutes: 60,
          source: "native",
        },
      ]),
    ).rejects.toThrow("appointment_chain_not_consecutive");
    expect(port.createOnlineAppointmentsIfAvailable).not.toHaveBeenCalled();
  });

  it("rejects sub-minute online ranges before reaching the range-locking port", async () => {
    const port = mockPort();
    const svc = createBookingEngineService(port);
    await expect(
      svc.createOnlineAppointmentsIfAvailable([
        {
          organizationId: "a0000000-0000-4000-8000-000000000001",
          startAt: "2026-06-01T10:00:30Z",
          endAt: "2026-06-01T11:00:30Z",
          durationMinutes: 60,
          source: "native",
        },
      ]),
    ).rejects.toThrow("online_slot_minute_alignment_required");
    expect(port.createOnlineAppointmentsIfAvailable).not.toHaveBeenCalled();
  });

  it("bounds the online range-lock cost to the allowed eight-hour chain", async () => {
    const port = mockPort();
    const svc = createBookingEngineService(port);
    await expect(
      svc.createOnlineAppointmentsIfAvailable([
        {
          organizationId: "a0000000-0000-4000-8000-000000000001",
          startAt: "2026-06-01T10:00:00Z",
          endAt: "2026-06-01T18:01:00Z",
          durationMinutes: 481,
          source: "native",
        },
      ]),
    ).rejects.toThrow("online_appointment_range_too_large");
    expect(port.createOnlineAppointmentsIfAvailable).not.toHaveBeenCalled();
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

  it("forwards the atomic solo service-location command to one port operation", async () => {
    const setSoloServiceLocationAvailability = vi.fn().mockResolvedValue({
      locationAvailability: { id: "location" },
      specialistAvailability: { id: "specialist" },
    });
    const port = mockPort({ setSoloServiceLocationAvailability });
    const svc = createBookingEngineService(port);
    const input = {
      organizationId: "a0000000-0000-4000-8000-000000000001",
      specialistId: "a0000000-0000-4000-8000-000000000002",
      serviceId: "a0000000-0000-4000-8000-000000000003",
      branchId: "a0000000-0000-4000-8000-000000000004",
      isActive: true,
    };

    await svc.services.setSoloServiceLocationAvailability(input);

    expect(setSoloServiceLocationAvailability).toHaveBeenCalledOnce();
    expect(setSoloServiceLocationAvailability).toHaveBeenCalledWith(input);
  });
});
