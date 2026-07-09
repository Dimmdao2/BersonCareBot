import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const staffCancelMock = vi.hoisted(() => vi.fn());
const runStaffManualCancelAfterCanonicalMock = vi.hoisted(() => vi.fn());
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

vi.mock("../../../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/booking/staffManualCancelAfterCanonical", () => ({
  runStaffManualCancelAfterCanonical: runStaffManualCancelAfterCanonicalMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/modules/integrator/bookingM2mApi", () => ({
  createBookingSyncPort: () => null,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingAppointmentLifecycle: { staffCancel: staffCancelMock },
    appointmentProjection: null,
    patientBooking: null,
    payments: null,
    memberships: null,
    systemSettings: { getSetting: vi.fn().mockResolvedValue(null) },
  }),
}));

import { POST } from "./route";

describe("POST admin manual-cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
  });

  it("returns ok with rubitimeMirrorFailed flag when mirror fails after canonical cancel", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "a1", role: "admin" } },
        service: { getRubitimeAppointmentId: vi.fn().mockResolvedValue("rt-1") },
      },
    });
    staffCancelMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return {
        ok: true,
        appointment: { id: "appt-1" },
        cancelPolicy: { notifyPatient: true, notifyStaff: true },
      };
    });
    runStaffManualCancelAfterCanonicalMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return { rubitimeMirrorFailed: true };
    });

    const res = await POST(
      new Request("http://localhost/manual-cancel", {
        method: "POST",
        body: JSON.stringify({ decisionType: "penalized" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }) },
    );
    const json = (await res.json()) as { ok?: boolean; rubitimeMirrorFailed?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.rubitimeMirrorFailed).toBe(true);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "admin.booking-engine.appointments.manual-cancel",
      expect.any(Function),
    );
  });

  it("returns ok when lifecycle accepts cancel", async () => {
    runStaffManualCancelAfterCanonicalMock.mockResolvedValue({});
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "a1", role: "admin" } },
        service: {
          getRubitimeAppointmentId: vi.fn().mockResolvedValue(null),
        },
      },
    });
    staffCancelMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return {
        ok: true,
        appointment: { id: "appt-1" },
        cancelPolicy: { notifyPatient: true, notifyStaff: true },
      };
    });

    const res = await POST(
      new Request("http://localhost/manual-cancel", {
        method: "POST",
        body: JSON.stringify({ decisionType: "penalized" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }) },
    );
    const json = (await res.json()) as { ok?: boolean };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
