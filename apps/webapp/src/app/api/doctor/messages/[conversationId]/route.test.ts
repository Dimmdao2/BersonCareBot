import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, getMessagesMock, sendMock, buildAppDepsMock } = vi.hoisted(() => {
  const getSessionMockInner = vi.fn();
  const getMessagesMockInner = vi.fn();
  const sendMockInner = vi.fn();
  return {
    getSessionMock: getSessionMockInner,
    getMessagesMock: getMessagesMockInner,
    sendMock: sendMockInner,
    buildAppDepsMock: vi.fn(() => ({
      messaging: {
        doctorSupport: {
          listOpenConversations: vi.fn(),
          getMessages: getMessagesMockInner,
          sendAdminReply: sendMockInner,
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

import { GET, POST } from "./route";

const cid = "00000000-0000-4000-8000-000000000099";

describe("GET /api/doctor/messages/[conversationId]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getMessagesMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/doctor/messages/${cid}`), {
      params: Promise.resolve({ conversationId: cid }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when conversation missing", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getMessagesMock.mockResolvedValue(null);
    const res = await GET(new Request(`http://localhost/api/doctor/messages/${cid}`), {
      params: Promise.resolve({ conversationId: cid }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with messages", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getMessagesMock.mockResolvedValue({
      messages: [
        {
          id: "m1",
          integratorMessageId: "x",
          conversationId: cid,
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
    const res = await GET(new Request(`http://localhost/api/doctor/messages/${cid}`), {
      params: Promise.resolve({ conversationId: cid }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; messages: unknown[] };
    expect(data.ok).toBe(true);
    expect(data.messages).toHaveLength(1);
  });
});

describe("POST /api/doctor/messages/[conversationId]", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    sendMock.mockReset();
  });

  it("returns 403 when not doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    const res = await POST(
      new Request(`http://localhost/api/doctor/messages/${cid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "reply" }),
      }),
      { params: Promise.resolve({ conversationId: cid }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 on success", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    sendMock.mockResolvedValue({ ok: true });
    const res = await POST(
      new Request(`http://localhost/api/doctor/messages/${cid}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "reply" }),
      }),
      { params: Promise.resolve({ conversationId: cid }) }
    );
    expect(res.status).toBe(200);
  });
});
