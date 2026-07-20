import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireDoctorWorkspaceApiContextMock, unreadFromPatientMock, getClientIdentityMock, buildAppDepsMock } = vi.hoisted(() => {
  const unreadFromPatientMockInner = vi.fn();
  const getClientIdentityMockInner = vi.fn();
  return {
    requireDoctorWorkspaceApiContextMock: vi.fn(),
    unreadFromPatientMock: unreadFromPatientMockInner,
    getClientIdentityMock: getClientIdentityMockInner,
    buildAppDepsMock: vi.fn(() => ({
      doctorClientsPort: {
        getClientIdentityForOrganization: getClientIdentityMockInner,
      },
      messaging: {
        doctorSupport: {
          listOpenConversations: vi.fn(),
          ensureConversationForPatient: vi.fn(),
          getMessages: vi.fn(),
          sendAdminReply: vi.fn(),
          markUserMessagesRead: vi.fn(),
          unreadFromUsers: vi.fn(),
          unreadFromPatient: unreadFromPatientMockInner,
        },
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: requireDoctorWorkspaceApiContextMock,
}));

import { POST } from "./route";

const patientUserId = "00000000-0000-4000-8000-000000000111";

function request(body: unknown) {
  return new Request("http://localhost/api/doctor/messages/conversations/unread-by-patient", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/doctor/messages/conversations/unread-by-patient", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: { organizationId: "10000000-0000-4000-8000-000000000001" },
    });
    unreadFromPatientMock.mockReset();
    getClientIdentityMock.mockReset();
  });

  it("returns 401 without session", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 401 }),
    });
    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not doctor", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: false,
      response: Response.json({}, { status: 403 }),
    });
    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid patientUserId", async () => {
    const res = await POST(request({ patientUserId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns unread count without ensuring a conversation", async () => {
    getClientIdentityMock.mockResolvedValue({
      userId: patientUserId,
      displayName: "Patient",
      phone: null,
      bindings: {},
      createdAt: null,
      isBlocked: false,
      blockedReason: null,
      isArchived: false,
      channelBindingDates: {},
    });
    unreadFromPatientMock.mockResolvedValue(2);

    const res = await POST(request({ patientUserId }));
    const data = (await res.json()) as { ok: boolean; unreadCount: number };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.unreadCount).toBe(2);
    expect(getClientIdentityMock).toHaveBeenCalledWith(
      patientUserId,
      "10000000-0000-4000-8000-000000000001",
    );
    expect(unreadFromPatientMock).toHaveBeenCalledWith(
      patientUserId,
      "10000000-0000-4000-8000-000000000001",
    );
  });

  it("returns 404 when patient is missing", async () => {
    getClientIdentityMock.mockResolvedValue(null);

    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(404);
    expect(unreadFromPatientMock).not.toHaveBeenCalled();
  });
});
