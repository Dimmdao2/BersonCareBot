import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorBookingEngineMock = vi.hoisted(() => vi.fn());
const getAppointmentMock = vi.hoisted(() => vi.fn());
const createAppointmentCommentMock = vi.hoisted(() => vi.fn());
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

vi.mock("../../../_requireDoctorBookingEngine", () => ({
  requireDoctorBookingEngine: requireDoctorBookingEngineMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    clientHistory: {
      createAppointmentComment: createAppointmentCommentMock,
    },
  }),
}));

vi.mock("@/app-layer/principal/withOrganizationPrincipal", () => ({
  withDoctorWorkspacePrincipal: withDoctorWorkspacePrincipalMock,
}));

import { POST } from "./route";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPOINTMENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PATIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOCTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function context(id = APPOINTMENT) {
  return { params: Promise.resolve({ id }) };
}

function request(body: unknown) {
  return new Request(`http://localhost/api/doctor/booking-engine/appointments/${APPOINTMENT}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/doctor/booking-engine/appointments/:id/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    principalState.inside = false;
    requireDoctorBookingEngineMock.mockResolvedValue({
      ok: true,
      ctx: {
        session: { user: { userId: DOCTOR } },
        service: {
          getAppointment: getAppointmentMock,
        },
        organizationId: ORG,
        membershipId: "membership-1",
        membershipRole: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });
    getAppointmentMock.mockResolvedValue({
      id: APPOINTMENT,
      organizationId: ORG,
      platformUserId: PATIENT,
    });
  });

  it("creates an appointment staff comment inside doctor workspace principal", async () => {
    createAppointmentCommentMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(true);
      return {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        appointmentId: APPOINTMENT,
        platformUserId: PATIENT,
        authorId: DOCTOR,
        body: "Follow up",
        createdAt: "2026-07-09T00:00:00.000Z",
        updatedAt: "2026-07-09T00:00:00.000Z",
      };
    });

    const res = await POST(request({ body: "Follow up" }), context());
    const json = (await res.json()) as { ok: boolean; comment: { body: string } };

    expect(res.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({ ok: true, comment: expect.objectContaining({ body: "Follow up" }) }));
    expect(getAppointmentMock).toHaveBeenCalledWith(APPOINTMENT);
    expect(createAppointmentCommentMock).toHaveBeenCalledWith({
      organizationId: ORG,
      appointmentId: APPOINTMENT,
      platformUserId: PATIENT,
      authorId: DOCTOR,
      body: "Follow up",
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      "doctor.booking.appointment-comment.create",
      expect.any(Function),
    );
    expect(principalState.inside).toBe(false);
  });

  it("does not wrap the pre-mutation appointment access check", async () => {
    getAppointmentMock.mockImplementation(async () => {
      expect(principalState.inside).toBe(false);
      return null;
    });

    const res = await POST(request({ body: "Follow up" }), context());
    const json = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(404);
    expect(json).toEqual({ ok: false, error: "not_found" });
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(createAppointmentCommentMock).not.toHaveBeenCalled();
  });

  it("rejects missing author id before mutation", async () => {
    requireDoctorBookingEngineMock.mockResolvedValueOnce({
      ok: true,
      ctx: {
        session: { user: { userId: null } },
        service: {
          getAppointment: getAppointmentMock,
        },
        organizationId: ORG,
        membershipId: "membership-1",
        membershipRole: "doctor",
        specialistId: "specialist-1",
        canManageOrganization: false,
        canManageAllSpecialists: false,
      },
    });

    const res = await POST(request({ body: "Follow up" }), context());
    const json = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(401);
    expect(json).toEqual({ ok: false, error: "unauthorized" });
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
    expect(createAppointmentCommentMock).not.toHaveBeenCalled();
  });
});
