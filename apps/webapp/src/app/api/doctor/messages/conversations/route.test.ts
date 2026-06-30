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
    listClientsMock.mockReset();
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
    // isOnSupport must be included in the mock — the route reads it from the client object.
    listClientsMock.mockResolvedValue([{ userId: supportUserId, isOnSupport: true }]);

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

  it("calls listClients with scoped userIds extracted from conversations (EXTRA-02)", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const p1 = "aaaaaaaa-0000-4000-8000-000000000001";
    const p2 = "bbbbbbbb-0000-4000-8000-000000000002";
    listMock.mockResolvedValue([
      {
        conversationId: "ccc1",
        integratorConversationId: `webapp:platform:${p1}`,
        source: "webapp",
        status: "open",
        openedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: "2025-01-02T00:00:00.000Z",
        displayName: "Пациент 1",
        phoneNormalized: null,
        lastMessageText: null,
        lastSenderRole: null,
        unreadFromUserCount: 0,
      },
      {
        conversationId: "ccc2",
        integratorConversationId: `webapp:platform:${p2}`,
        source: "webapp",
        status: "open",
        openedAt: "2025-01-01T00:00:00.000Z",
        lastMessageAt: "2025-01-02T00:00:00.000Z",
        displayName: "Пациент 2",
        phoneNormalized: null,
        lastMessageText: null,
        lastSenderRole: null,
        unreadFromUserCount: 1,
      },
    ]);
    listClientsMock.mockResolvedValue([
      { userId: p1, firstName: "Иван", lastName: "Иванов", isOnSupport: true },
      { userId: p2, firstName: "Мария", lastName: "Петрова", isOnSupport: false },
    ]);

    const res = await GET(new Request("http://localhost/api/doctor/messages/conversations"));
    expect(res.status).toBe(200);

    // Verify listClients was called with exactly the two patient userIds, not an empty filter.
    expect(listClientsMock).toHaveBeenCalledTimes(1);
    const callArgs = listClientsMock.mock.calls[0]?.[0] as { userIds?: string[] };
    expect(callArgs.userIds).toBeDefined();
    expect(callArgs.userIds?.sort()).toEqual([p1, p2].sort());

    const data = (await res.json()) as {
      ok: boolean;
      conversations: { displayName: string; firstName: string | null; onSupport: boolean }[];
    };
    expect(data.ok).toBe(true);
    expect(data.conversations).toHaveLength(2);
    const conv1 = data.conversations.find((c) => c.displayName === "Пациент 1");
    expect(conv1?.firstName).toBe("Иван");
    expect(conv1?.onSupport).toBe(true);
  });

  it("skips listClients when conversation list is empty (EXTRA-02)", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    listMock.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/doctor/messages/conversations"));
    expect(res.status).toBe(200);

    // No patient userIds → listClients must NOT be called at all.
    expect(listClientsMock).not.toHaveBeenCalled();
    const data = (await res.json()) as { ok: boolean; conversations: unknown[] };
    expect(data.conversations).toHaveLength(0);
  });
});
