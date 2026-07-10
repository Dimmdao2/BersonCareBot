import { beforeEach, describe, expect, it, vi } from "vitest";

const detachAppointmentPackageMock = vi.hoisted(() => vi.fn());
const getAppointmentMock = vi.hoisted(() => vi.fn());
const resolveCancellationPolicyMock = vi.hoisted(() => vi.fn());
const getSettingMock = vi.hoisted(() => vi.fn());
const emitPackageCalendarSyncMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    memberships: {
      detachAppointmentPackage: detachAppointmentPackageMock,
    },
    bookingEngine: {
      getAppointment: getAppointmentMock,
    },
    bookingPolicies: {
      resolveCancellationPolicy: resolveCancellationPolicyMock,
    },
    systemSettings: {
      getSetting: getSettingMock,
    },
  }),
}));

vi.mock("@/app-layer/booking/emitPackageCalendarSync", () => ({
  emitPackageCalendarSync: emitPackageCalendarSyncMock,
}));

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: () => ({ emitBookingEvent: vi.fn() }),
}));

import { runPackageDetach } from "./packageDetachShared";

describe("runPackageDetach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppointmentMock.mockResolvedValue({
      id: "appt-1",
      organizationId: "org-1",
      specialistId: "spec-1",
      serviceId: "svc-1",
      startAt: "2026-06-01T10:00:00.000Z",
    });
    resolveCancellationPolicyMock.mockResolvedValue(null);
    getSettingMock.mockResolvedValue(null);
    detachAppointmentPackageMock.mockResolvedValue({ ok: true });
    emitPackageCalendarSyncMock.mockResolvedValue(undefined);
  });

  it("wraps only the detach mutation and keeps calendar sync outside", async () => {
    const principalState = { inside: false };
    getAppointmentMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return {
        id: "appt-1",
        organizationId: "org-1",
        specialistId: "spec-1",
        serviceId: "svc-1",
        startAt: "2026-06-01T10:00:00.000Z",
      };
    });
    detachAppointmentPackageMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return { ok: true };
    });
    emitPackageCalendarSyncMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
    });

    const res = await runPackageDetach({
      organizationId: "org-1",
      appointmentId: "appt-1",
      createdByPlatformUserId: "user-1",
      outcome: "release_reserve",
      runDetachMutation: async (fn) => {
        principalState.inside = true;
        try {
          return await fn();
        } finally {
          principalState.inside = false;
        }
      },
    });

    expect(res.status).toBe(200);
    expect(detachAppointmentPackageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        appointmentId: "appt-1",
        createdByPlatformUserId: "user-1",
        outcome: "release_reserve",
      }),
    );
    expect(emitPackageCalendarSyncMock).toHaveBeenCalledTimes(1);
    expect(principalState.inside).toBe(false);
  });

  it("does not call the detach wrapper when the appointment is missing", async () => {
    const runDetachMutationSpy = vi.fn();
    const runDetachMutation = async <T,>(fn: () => Promise<T>): Promise<T> => {
      runDetachMutationSpy();
      return fn();
    };
    getAppointmentMock.mockResolvedValueOnce(null);

    const res = await runPackageDetach({
      organizationId: "org-1",
      appointmentId: "missing",
      createdByPlatformUserId: "user-1",
      runDetachMutation,
    });
    const json = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(json.error).toBe("appointment_not_found");
    expect(runDetachMutationSpy).not.toHaveBeenCalled();
    expect(detachAppointmentPackageMock).not.toHaveBeenCalled();
  });
});
