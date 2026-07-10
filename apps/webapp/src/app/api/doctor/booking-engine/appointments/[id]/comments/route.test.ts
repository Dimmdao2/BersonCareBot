import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireDoctorWorkspaceApiContextMock,
  withDoctorWorkspacePrincipalMock,
  listAppointmentCommentsMock,
  createAppointmentCommentMock,
  getAppointmentMock,
} = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContextMock: vi.fn(),
  withDoctorWorkspacePrincipalMock: vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}),
  listAppointmentCommentsMock: vi.fn(),
  createAppointmentCommentMock: vi.fn(),
  getAppointmentMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    bookingEngine: {
      getAppointment: getAppointmentMock,
    },
    clientHistory: {
      listAppointmentComments: listAppointmentCommentsMock,
      createAppointmentComment: createAppointmentCommentMock,
    },
  }),
}));

import { GET, POST } from "./route";

const appointmentId = "11111111-1111-4111-8111-111111111111";
const patientUserId = "22222222-2222-4222-8222-222222222222";

describe("doctor booking appointment comments principal", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "org-1", session: { user: { userId: "doc-1", role: "doctor" } } },
    });
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    listAppointmentCommentsMock.mockReset();
    createAppointmentCommentMock.mockReset();
    getAppointmentMock.mockReset();
  });

  it("lists comments in selected workspace organization", async () => {
    listAppointmentCommentsMock.mockResolvedValue([]);

    const res = await GET(new Request(`http://localhost/api/doctor/booking-engine/appointments/${appointmentId}/comments`), {
      params: Promise.resolve({ id: appointmentId }),
    });

    expect(res.status).toBe(200);
    expect(listAppointmentCommentsMock).toHaveBeenCalledWith("org-1", appointmentId);
  });

  it("creates comment through selected workspace principal", async () => {
    getAppointmentMock.mockResolvedValue({
      id: appointmentId,
      organizationId: "org-1",
      platformUserId: patientUserId,
    });
    createAppointmentCommentMock.mockResolvedValue({
      id: "comment-1",
      appointmentId,
      platformUserId: patientUserId,
      authorId: "doc-1",
      body: "note",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const res = await POST(
      new Request(`http://localhost/api/doctor/booking-engine/appointments/${appointmentId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "note" }),
      }),
      { params: Promise.resolve({ id: appointmentId }) },
    );

    expect(res.status).toBe(200);
    expect(createAppointmentCommentMock).toHaveBeenCalledWith({
      organizationId: "org-1",
      appointmentId,
      platformUserId: patientUserId,
      authorId: "doc-1",
      body: "note",
    });
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      expect.any(Function),
    );
  });

  it("does not create comment for appointment outside selected workspace", async () => {
    getAppointmentMock.mockResolvedValue({
      id: appointmentId,
      organizationId: "org-2",
      platformUserId: patientUserId,
    });

    const res = await POST(
      new Request(`http://localhost/api/doctor/booking-engine/appointments/${appointmentId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "note" }),
      }),
      { params: Promise.resolve({ id: appointmentId }) },
    );

    expect(res.status).toBe(404);
    expect(createAppointmentCommentMock).not.toHaveBeenCalled();
    expect(withDoctorWorkspacePrincipalMock).not.toHaveBeenCalled();
  });
});
