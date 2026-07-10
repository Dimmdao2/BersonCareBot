import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const staffMarkNoShowMock = vi.hoisted(() => vi.fn());
const runStaffManualNoShowAfterCanonicalMock = vi.hoisted(() => vi.fn());
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

vi.mock("@/app-layer/booking/staffManualNoShow", () => ({
  runStaffManualNoShowAfterCanonical: runStaffManualNoShowAfterCanonicalMock,
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingAppointmentLifecycle: { staffMarkNoShow: staffMarkNoShowMock },
    appointmentProjection: null,
    patientBooking: null,
    payments: null,
    memberships: null,
    systemSettings: { getSetting: vi.fn().mockResolvedValue(null) },
  }),
}));

import { POST } from "./route";

describe("POST admin manual-no-show", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
  });

  it("runs canonical no-show mutation under doctor workspace principal", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "a1", role: "admin" } },
      },
    });
    staffMarkNoShowMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return {
        ok: true,
        appointment: { id: "appt-1" },
      };
    });
    runStaffManualNoShowAfterCanonicalMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return {};
    });

    const res = await POST(
      new Request("http://localhost/manual-no-show", {
        method: "POST",
        body: JSON.stringify({ reason: "missed" }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }) },
    );
    const json = (await res.json()) as { ok?: boolean };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "admin.booking-engine.appointments.manual-no-show",
      expect.any(Function),
    );
    expect(staffMarkNoShowMock).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }),
    );
  });
});
