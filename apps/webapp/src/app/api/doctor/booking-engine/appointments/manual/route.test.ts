import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const principalState = vi.hoisted(() => ({ inside: false }));
const withDoctorWorkspacePrincipalMock = vi.hoisted(() =>
  vi.fn(async <T,>(
    _workspace: { organizationId: string },
    _source: string,
    fn: () => Promise<T>,
  ) => {
    principalState.inside = true;
    try {
      return await fn();
    } finally {
      principalState.inside = false;
    }
  }),
);
const createAppointmentMock = vi.hoisted(() => vi.fn());
const transitionAppointmentStatusMock = vi.hoisted(() => vi.fn());
const deleteAppointmentHardMock = vi.hoisted(() => vi.fn());
const emitBookingEventMock = vi.hoisted(() => vi.fn());
const createRecordMock = vi.hoisted(() => vi.fn());
const resolveLegacyBranchServiceIdMock = vi.hoisted(() => vi.fn());
const assertSlotAvailableMock = vi.hoisted(() => vi.fn());
const hasSchedulableClientRelationshipMock = vi.hoisted(() => vi.fn());
const bridgeEnabledState = vi.hoisted(() => ({ value: true }));

vi.mock("../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: () => ({
    createRecord: createRecordMock,
    cancelRecord: vi.fn(),
    deleteRecord: vi.fn(),
    emitBookingEvent: emitBookingEventMock,
  }),
}));

vi.mock("@/app-layer/booking/emitPackageCalendarSync", () => ({
  emitPackageLinkedCalendarSync: vi.fn().mockResolvedValue("skipped"),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingScheduling: {
      assertSlotAvailable: assertSlotAvailableMock,
      resolveLegacyBranchServiceId: resolveLegacyBranchServiceIdMock,
    },
    rubitimeCanonicalProjection: {
      isBridgeEnabled: async () => bridgeEnabledState.value,
    },
    memberships: null,
    patientBooking: null,
    patientOrganization: {
      hasSchedulableClientRelationship: hasSchedulableClientRelationshipMock,
    },
  }),
}));

import { POST } from "./route";

describe("POST manual appointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    bridgeEnabledState.value = true;
    hasSchedulableClientRelationshipMock.mockResolvedValue(true);
    assertSlotAvailableMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
    });
    emitBookingEventMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
    });
  });

  it("creates the canonical appointment for a newly created patient despite legacy bridge enablement", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1", role: "doctor" } },
        service: {
          createAppointment: createAppointmentMock,
          transitionAppointmentStatus: transitionAppointmentStatusMock,
          deleteAppointmentHard: deleteAppointmentHardMock,
          upsertRubitimeAppointmentMapping: vi.fn(),
        },
      },
    });
    createRecordMock.mockRejectedValue(new Error("rubitime unavailable"));
    createAppointmentMock.mockResolvedValue({
      id: "appt-1",
      startAt: "2026-06-01T10:00:00.000Z",
      endAt: "2026-06-01T11:00:00.000Z",
      platformUserId: null,
      phoneNormalized: null,
      attributionJson: {},
      organizationId: "org-1",
      status: "confirmed",
      source: "admin_manual",
    });

    const res = await POST(
      new Request("http://localhost/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: "11111111-1111-4111-8111-111111111111",
          serviceId: "22222222-2222-4222-8222-222222222222",
          specialistId: "33333333-3333-4333-8333-333333333333",
          platformUserId: "44444444-4444-4444-8444-444444444444",
          phoneNormalized: "+79990001122",
          startAt: "2026-06-01T10:00:00.000Z",
          endAt: "2026-06-01T11:00:00.000Z",
          durationMinutes: 60,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(resolveLegacyBranchServiceIdMock).not.toHaveBeenCalled();
    expect(createRecordMock).not.toHaveBeenCalled();
    expect(createAppointmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ platformUserId: "44444444-4444-4444-8444-444444444444" }),
    );
    expect(hasSchedulableClientRelationshipMock).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      "org-1",
    );
    expect(deleteAppointmentHardMock).not.toHaveBeenCalled();
    expect(transitionAppointmentStatusMock).not.toHaveBeenCalled();
    expect(emitBookingEventMock).toHaveBeenCalled();
  });

  it("rejects a foreign or global platform user before inserting a manual appointment", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1", role: "doctor" } },
        service: {
          createAppointment: createAppointmentMock,
          catalog: { listSpecialists: vi.fn() },
        },
      },
    });
    hasSchedulableClientRelationshipMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return false;
    });

    const res = await POST(
      new Request("http://localhost/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          specialistId: "33333333-3333-4333-8333-333333333333",
          platformUserId: "44444444-4444-4444-8444-444444444444",
          startAt: "2026-06-01T10:00:00.000Z",
          endAt: "2026-06-01T11:00:00.000Z",
          durationMinutes: 60,
        }),
      }),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "patient_not_available" });
    expect(createAppointmentMock).not.toHaveBeenCalled();
    expect(principalState.inside).toBe(false);
  });

  it("F2: rejects in-person create with no resolvable specialist (not inserted)", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1", role: "doctor" } },
        service: {
          catalog: { listSpecialists: vi.fn().mockResolvedValue([]) },
          createAppointment: createAppointmentMock,
          transitionAppointmentStatus: transitionAppointmentStatusMock,
          deleteAppointmentHard: deleteAppointmentHardMock,
          upsertRubitimeAppointmentMapping: vi.fn(),
        },
      },
    });

    const res = await POST(
      new Request("http://localhost/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: "11111111-1111-4111-8111-111111111111",
          serviceId: "22222222-2222-4222-8222-222222222222",
          // no specialistId, none resolvable from catalog
          startAt: "2026-06-01T10:00:00.000Z",
          endAt: "2026-06-01T11:00:00.000Z",
          durationMinutes: 60,
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean; error?: string };
    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error).toBe("specialist_required");
    expect(createAppointmentMock).not.toHaveBeenCalled();
    expect(assertSlotAvailableMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledOnce();
  });

  it("F2: in-person create with a resolvable specialist succeeds (uses default specialist)", async () => {
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "u1", role: "doctor" } },
        service: {
          catalog: {
            listSpecialists: vi
              .fn()
              .mockResolvedValue([{ id: "33333333-3333-4333-8333-333333333333", isActive: true }]),
          },
          createAppointment: createAppointmentMock,
          transitionAppointmentStatus: transitionAppointmentStatusMock,
          deleteAppointmentHard: deleteAppointmentHardMock,
          upsertRubitimeAppointmentMapping: vi.fn(),
          getAppointment: vi.fn(),
        },
      },
    });
    createAppointmentMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return {
        id: "appt-1",
        startAt: "2026-06-01T10:00:00.000Z",
        endAt: "2026-06-01T11:00:00.000Z",
        platformUserId: null,
        phoneNormalized: null,
        attributionJson: {},
        organizationId: "org-1",
        status: "confirmed",
        source: "admin_manual",
        specialistId: "33333333-3333-4333-8333-333333333333",
      };
    });
    resolveLegacyBranchServiceIdMock.mockResolvedValue("branch-service-id");
    createRecordMock.mockResolvedValue({ rubitimeId: "rt-1", raw: {} });

    const res = await POST(
      new Request("http://localhost/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          branchId: "11111111-1111-4111-8111-111111111111",
          serviceId: "22222222-2222-4222-8222-222222222222",
          // no explicit specialistId → resolved from catalog default
          startAt: "2026-06-01T10:00:00.000Z",
          endAt: "2026-06-01T11:00:00.000Z",
          durationMinutes: 60,
        }),
      }),
    );
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(assertSlotAvailableMock).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: "33333333-3333-4333-8333-333333333333" }),
    );
    expect(createAppointmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ specialistId: "33333333-3333-4333-8333-333333333333" }),
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "doctor.booking-engine.appointments.manual-create",
      expect.any(Function),
    );
    expect(principalState.inside).toBe(false);
  });
});
