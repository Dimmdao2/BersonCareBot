import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const createManualPatientVisitMock = vi.hoisted(() => vi.fn());
const getAppointmentMock = vi.hoisted(() => vi.fn());
const assertSlotAvailableMock = vi.hoisted(() => vi.fn());
const emitBookingEventMock = vi.hoisted(() => vi.fn());
const getBookingByCanonicalAppointmentMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));

vi.mock("../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: { assertSlotAvailable: assertSlotAvailableMock },
    patientBooking: { getBookingByCanonicalAppointment: getBookingByCanonicalAppointmentMock },
    emailSetupAccess: { requestContactEmailSetup: vi.fn() },
  }),
}));
vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: vi.fn(async (_ctx, _source, fn) => {
    principalState.inside = true;
    try {
      return await fn();
    } finally {
      principalState.inside = false;
    }
  }),
}));
vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: () => ({ emitBookingEvent: emitBookingEventMock }),
}));

import { POST } from "./route";

const requestBody = {
  kind: "scheduled",
  requestId: "99999999-9999-4999-8999-999999999999",
  lastName: "Новый",
  firstName: "Пациент",
  patronymic: null,
  phone: "+79990000000",
  email: null,
  branchId: "11111111-1111-4111-8111-111111111111",
  serviceId: "33333333-3333-4333-8333-333333333333",
  startAt: "2026-07-20T10:00:00.000Z",
  endAt: "2026-07-20T11:00:00.000Z",
  durationMinutes: 60,
};

function request(body: Record<string, unknown> = requestBody) {
  return new Request("http://localhost/manual-patient-visit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST manual patient visit", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    principalState.inside = false;
    assertSlotAvailableMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
    });
    getAppointmentMock.mockResolvedValue(null);
    getBookingByCanonicalAppointmentMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return null;
    });
    emitBookingEventMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
    });
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "44444444-4444-4444-8444-444444444444",
        specialistId: "22222222-2222-4222-8222-222222222222",
        session: { user: { userId: "55555555-5555-4555-8555-555555555555" } },
        service: {
          createManualPatientVisit: createManualPatientVisitMock,
          getAppointment: getAppointmentMock,
        },
      },
    });
  });

  it("uses one atomic domain command under the trusted organization principal", async () => {
    createManualPatientVisitMock.mockImplementation(async (input) => {
      expect(principalState.inside).toBe(true);
      return {
        kind: "scheduled",
        replayed: false,
        clinicalVisitId: null,
        portalStatus: "not_activated",
        patient: {
          userId: "66666666-6666-4666-8666-666666666666",
          displayName: `${input.lastName} ${input.firstName}`,
          lastName: input.lastName,
          firstName: input.firstName,
          patronymic: input.patronymic,
          phoneNormalized: input.phoneNormalized,
          created: true,
        },
        appointment: {
          id: "77777777-7777-4777-8777-777777777777",
          organizationId: input.organizationId,
          startAt: input.appointment.startAt,
          endAt: input.appointment.endAt,
          platformUserId: "66666666-6666-4666-8666-666666666666",
          phoneNormalized: input.phoneNormalized,
          serviceId: input.appointment.serviceId,
          attributionJson: {},
        },
      };
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(createManualPatientVisitMock).toHaveBeenCalledOnce();
    expect(assertSlotAvailableMock).toHaveBeenCalledOnce();
    expect(createManualPatientVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "44444444-4444-4444-8444-444444444444",
        commandId: requestBody.requestId,
        appointment: expect.objectContaining({
          specialistId: "22222222-2222-4222-8222-222222222222",
          status: "confirmed",
        }),
      }),
    );
    expect(principalState.inside).toBe(false);
    expect(emitBookingEventMock).toHaveBeenCalledOnce();
  });

  it("keeps a committed visit successful when optional booking enrichment fails", async () => {
    createManualPatientVisitMock.mockResolvedValue({
      kind: "scheduled",
      replayed: false,
      clinicalVisitId: null,
      portalStatus: "not_activated",
      patient: {
        userId: "66666666-6666-4666-8666-666666666666",
        displayName: "Новый Пациент",
        lastName: "Новый",
        firstName: "Пациент",
        patronymic: null,
        phoneNormalized: "+79990000000",
        created: true,
      },
      appointment: {
        id: "77777777-7777-4777-8777-777777777777",
        organizationId: "44444444-4444-4444-8444-444444444444",
        startAt: requestBody.startAt,
        endAt: requestBody.endAt,
        platformUserId: "66666666-6666-4666-8666-666666666666",
        phoneNormalized: "+79990000000",
        serviceId: requestBody.serviceId,
        attributionJson: {},
      },
    });
    getBookingByCanonicalAppointmentMock.mockRejectedValue(new Error("projection_read_failed"));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(emitBookingEventMock).toHaveBeenCalledOnce();
  });

  it("does not open the transaction for an invalid body", async () => {
    const response = await POST(request({ ...requestBody, durationMinutes: 0 }));
    expect(response.status).toBe(400);
    expect(createManualPatientVisitMock).not.toHaveBeenCalled();
    expect(assertSlotAvailableMock).not.toHaveBeenCalled();
  });

  it("rejects the legacy displayName-only identity contract", async () => {
    const response = await POST(
      request({
        ...requestBody,
        lastName: undefined,
        firstName: undefined,
        displayName: "Новый пациент",
      }),
    );

    expect(response.status).toBe(400);
    expect(createManualPatientVisitMock).not.toHaveBeenCalled();
  });

  it("returns a conflict when the atomic transaction reports an occupied slot", async () => {
    createManualPatientVisitMock.mockRejectedValue(Object.assign(new Error("slot_overlap"), { code: "23P01" }));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: "slot_overlap" });
  });

  it("rejects client-supplied specialist or organization authority", async () => {
    const response = await POST(
      request({
        ...requestBody,
        specialistId: "99999999-9999-4999-8999-999999999999",
        organizationId: "88888888-8888-4888-8888-888888888888",
      }),
    );

    expect(response.status).toBe(400);
    expect(createManualPatientVisitMock).not.toHaveBeenCalled();
  });

  it("denies staff without a bound clinical actor", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "44444444-4444-4444-8444-444444444444",
        specialistId: null,
        canManageOrganization: true,
        canManageAllSpecialists: true,
        session: { user: { userId: "55555555-5555-4555-8555-555555555555" } },
        service: {
          createManualPatientVisit: createManualPatientVisitMock,
          getAppointment: getAppointmentMock,
        },
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "specialist_required" });
    expect(createManualPatientVisitMock).not.toHaveBeenCalled();
  });

  it("creates a walk-in for the trusted actor without slot checks or booking events", async () => {
    createManualPatientVisitMock.mockImplementation(async (input) => ({
      kind: "walk_in",
      replayed: false,
      clinicalVisitId: "88888888-8888-4888-8888-888888888888",
      portalStatus: "not_activated",
      patient: {
        userId: "66666666-6666-4666-8666-666666666666",
        displayName: `${input.lastName} ${input.firstName}`,
        lastName: input.lastName,
        firstName: input.firstName,
        patronymic: input.patronymic,
        phoneNormalized: input.phoneNormalized,
        created: true,
      },
      appointment: null,
    }));

    const response = await POST(
      request({
        kind: "walk_in",
        requestId: "88888888-8888-4888-8888-888888888888",
        lastName: "Новый",
        firstName: "Пациент",
        patronymic: null,
        phone: "+79990000000",
        email: null,
        visitedAt: "2026-07-20T09:30:00.000Z",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      visitKind: "walk_in",
      portalStatus: "not_activated",
    });
    expect(createManualPatientVisitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "44444444-4444-4444-8444-444444444444",
        commandId: "88888888-8888-4888-8888-888888888888",
        kind: "walk_in",
        walkIn: expect.objectContaining({
          specialistId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );
    expect(assertSlotAvailableMock).not.toHaveBeenCalled();
    expect(emitBookingEventMock).not.toHaveBeenCalled();
  });

  it("rejects a walk-in outside the explicit clock tolerance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T09:30:00.000Z"));
    const response = await POST(
      request({
        kind: "walk_in",
        requestId: "88888888-8888-4888-8888-888888888888",
        lastName: "Новый",
        firstName: "Пациент",
        patronymic: null,
        phone: "+79990000000",
        email: null,
        visitedAt: "2026-07-20T09:32:01.000Z",
      }),
    );
    vi.useRealTimers();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "visit_in_future" });
    expect(createManualPatientVisitMock).not.toHaveBeenCalled();
  });

  it("does not emit a second booking event for a scheduled command replay", async () => {
    getAppointmentMock.mockResolvedValue({
      id: requestBody.requestId,
      organizationId: "44444444-4444-4444-8444-444444444444",
    });
    createManualPatientVisitMock.mockResolvedValue({
      kind: "scheduled",
      replayed: true,
      clinicalVisitId: null,
      portalStatus: "not_activated",
      patient: {
        userId: "66666666-6666-4666-8666-666666666666",
        displayName: "Новый Пациент",
        lastName: "Новый",
        firstName: "Пациент",
        patronymic: null,
        phoneNormalized: "+79990000000",
        created: false,
      },
      appointment: {
        id: requestBody.requestId,
        organizationId: "44444444-4444-4444-8444-444444444444",
        startAt: requestBody.startAt,
        endAt: requestBody.endAt,
        platformUserId: "66666666-6666-4666-8666-666666666666",
        phoneNormalized: "+79990000000",
        serviceId: requestBody.serviceId,
        attributionJson: {},
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(assertSlotAvailableMock).not.toHaveBeenCalled();
    expect(emitBookingEventMock).not.toHaveBeenCalled();
  });
});
