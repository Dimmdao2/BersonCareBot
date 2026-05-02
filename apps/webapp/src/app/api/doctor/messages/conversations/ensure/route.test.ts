import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, ensureMock, getClientIdentityMock, buildAppDepsMock } = vi.hoisted(() => {
  const getSessionMockInner = vi.fn();
  const ensureMockInner = vi.fn();
  const getClientIdentityMockInner = vi.fn();
  return {
    getSessionMock: getSessionMockInner,
    ensureMock: ensureMockInner,
    getClientIdentityMock: getClientIdentityMockInner,
    buildAppDepsMock: vi.fn(() => ({
      doctorClientsPort: {
        getClientIdentity: getClientIdentityMockInner,
      },
      messaging: {
        doctorSupport: {
          listOpenConversations: vi.fn(),
          ensureConversationForPatient: ensureMockInner,
          getMessages: vi.fn(),
          sendAdminReply: vi.fn(),
          markUserMessagesRead: vi.fn(),
          unreadFromUsers: vi.fn(),
        },
      },
    })),
  };
});

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getSessionMock,
}));

import { POST } from "./route";

const patientUserId = "00000000-0000-4000-8000-000000000111";

function request(body: unknown) {
  return new Request("http://localhost/api/doctor/messages/conversations/ensure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/doctor/messages/conversations/ensure", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    ensureMock.mockReset();
    getClientIdentityMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid patientUserId", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const res = await POST(request({ patientUserId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when patient is missing", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getClientIdentityMock.mockResolvedValue(null);
    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(404);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("returns 500 when ensure conversation fails", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
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
    ensureMock.mockRejectedValue(new Error("db failed"));
    const res = await POST(request({ patientUserId }));
    expect(res.status).toBe(500);
  });

  it("returns ensured conversation with messages and unread count", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
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
    ensureMock.mockResolvedValue({
      conversationId: "00000000-0000-4000-8000-000000000222",
      unreadFromUserCount: 1,
      messages: [
        {
          id: "m1",
          integratorMessageId: "x",
          conversationId: "00000000-0000-4000-8000-000000000222",
          senderRole: "user",
          messageType: "text",
          text: "hello",
          source: "webapp",
          createdAt: "2025-03-01T12:00:00.000Z",
          readAt: null,
          deliveredAt: null,
          mediaUrl: null,
          mediaType: null,
        },
      ],
    });

    const res = await POST(request({ patientUserId }));
    const data = (await res.json()) as { ok: boolean; messages: unknown[]; unreadFromUserCount: number };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.messages).toHaveLength(1);
    expect(data.unreadFromUserCount).toBe(1);
    expect(ensureMock).toHaveBeenCalledWith(patientUserId);
  });
});
