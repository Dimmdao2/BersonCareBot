import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listMock, listClientsMock, buildAppDepsMock } = vi.hoisted(() => {
  const getSessionMockInner = vi.fn();
  const listMockInner = vi.fn();
  const listClientsMockInner = vi.fn().mockResolvedValue([]);
  return {
    getSessionMock: getSessionMockInner,
    listMock: listMockInner,
    listClientsMock: listClientsMockInner,
    buildAppDepsMock: vi.fn(() => ({
      messaging: {
        doctorSupport: {
          listOpenConversations: listMockInner,
          ensureConversationForPatient: vi.fn(),
          getMessages: vi.fn(),
          sendAdminReply: vi.fn(),
          markUserMessagesRead: vi.fn(),
          unreadFromUsers: vi.fn(),
        },
      },
      doctorClients: {
        listClients: listClientsMockInner,
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

import { GET } from "./route";

describe("GET /api/doctor/messages/conversations", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listMock.mockReset();
    listClientsMock.mockResolvedValue([]);
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/doctor/messages/conversations"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    const res = await GET(new Request("http://localhost/api/doctor/messages/conversations"));
    expect(res.status).toBe(403);
  });

  it("returns 200 with conversations for doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    listMock.mockResolvedValue([
      {
        conversationId: "00000000-0000-4000-8000-000000000002",
        integratorConversationId: "webapp:platform:x",
        source: "webapp",
        status: "open",
        openedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: "2025-01-02T00:00:00.000Z",
        displayName: "Пациент",
        phoneNormalized: "+7",
        lastMessageText: "Hi",
        lastSenderRole: "user",
        unreadFromUserCount: 2,
      },
    ]);
    const res = await GET(new Request("http://localhost/api/doctor/messages/conversations"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      conversations: { unreadFromUserCount: number; hasUnreadFromUser: boolean }[];
    };
    expect(data.ok).toBe(true);
    expect(data.conversations).toHaveLength(1);
    expect(data.conversations[0]?.unreadFromUserCount).toBe(2);
    expect(data.conversations[0]?.hasUnreadFromUser).toBe(true);
  });

  it("passes unread=1 as unreadOnly to service", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    listMock.mockResolvedValue([]);
    const res = await GET(new Request("http://localhost/api/doctor/messages/conversations?unread=1"));
    expect(res.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith({ limit: 50, unreadOnly: true });
  });

  it("marks onSupport=true when patient is in on-support list", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const supportUserId = "aaaaaaaa-0000-4000-8000-000000000001";
    listMock.mockResolvedValue([
      {
        conversationId: "00000000-0000-4000-8000-000000000010",
        integratorConversationId: `webapp:platform:${supportUserId}`,
        source: "webapp",
        status: "open",
        openedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: "2025-01-02T00:00:00.000Z",
        displayName: "Ирина Вовк",
        phoneNormalized: null,
        lastMessageText: "Спасибо",
        lastSenderRole: "user",
        unreadFromUserCount: 0,
      },
      {
        conversationId: "00000000-0000-4000-8000-000000000011",
        integratorConversationId: "webapp:platform:bbbbbbbb-0000-4000-8000-000000000002",
        source: "webapp",
        status: "open",
        openedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: "2025-01-02T00:00:00.000Z",
        displayName: "Другой Пациент",
        phoneNormalized: null,
        lastMessageText: null,
        lastSenderRole: null,
        unreadFromUserCount: 0,
      },
    ]);
    listClientsMock.mockResolvedValue([{ userId: supportUserId }]);

    const res = await GET(new Request("http://localhost/api/doctor/messages/conversations"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok: boolean;
      conversations: { displayName: string; onSupport: boolean }[];
    };
    expect(data.conversations).toHaveLength(2);
    expect(data.conversations.find((c) => c.displayName === "Ирина Вовк")?.onSupport).toBe(true);
    expect(data.conversations.find((c) => c.displayName === "Другой Пациент")?.onSupport).toBe(false);
  });

  it("gracefully sets onSupport=false for non-webapp conversation IDs", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    listMock.mockResolvedValue([
      {
        conversationId: "00000000-0000-4000-8000-000000000012",
        integratorConversationId: "telegram:12345",
        source: "telegram",
        status: "open",
        openedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: "2025-01-02T00:00:00.000Z",
        displayName: "TG User",
        phoneNormalized: null,
        lastMessageText: null,
        lastSenderRole: null,
        unreadFromUserCount: 0,
      },
    ]);
    listClientsMock.mockResolvedValue([{ userId: "some-user" }]);

    const res = await GET(new Request("http://localhost/api/doctor/messages/conversations"));
    const data = (await res.json()) as {
      ok: boolean;
      conversations: { onSupport: boolean }[];
    };
    expect(data.conversations[0]?.onSupport).toBe(false);
  });
});
