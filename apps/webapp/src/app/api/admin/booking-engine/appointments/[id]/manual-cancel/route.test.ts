import { describe, expect, it, vi } from "vitest";

const requireAdminBookingEngineMock = vi.hoisted(() => vi.fn());
const staffCancelMock = vi.hoisted(() => vi.fn());
const runStaffManualCancelAfterCanonicalMock = vi.hoisted(() => vi.fn());

vi.mock("../../../_requireAdminBookingEngine", () => ({
  requireAdminBookingEngine: requireAdminBookingEngineMock,
}));

vi.mock("@/app-layer/booking/staffManualCancelAfterCanonical", () => ({
  runStaffManualCancelAfterCanonical: runStaffManualCancelAfterCanonicalMock,
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
  it("returns ok with rubitimeMirrorFailed flag when mirror fails after canonical cancel", async () => {
    requireAdminBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId: "org-1",
        session: { user: { userId: "a1", role: "admin" } },
        service: { getRubitimeAppointmentId: vi.fn().mockResolvedValue("rt-1") },
      },
    });
    staffCancelMock.mockResolvedValue({
      ok: true,
      appointment: { id: "appt-1" },
      cancelPolicy: { notifyPatient: true, notifyStaff: true },
    });
    runStaffManualCancelAfterCanonicalMock.mockResolvedValue({ rubitimeMirrorFailed: true });

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
    staffCancelMock.mockResolvedValue({
      ok: true,
      appointment: { id: "appt-1" },
      cancelPolicy: { notifyPatient: true, notifyStaff: true },
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
