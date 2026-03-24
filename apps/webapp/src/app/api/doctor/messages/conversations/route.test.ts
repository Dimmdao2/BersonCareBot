import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, listMock, buildAppDepsMock } = vi.hoisted(() => {
  const getSessionMockInner = vi.fn();
  const listMockInner = vi.fn();
  return {
    getSessionMock: getSessionMockInner,
    listMock: listMockInner,
    buildAppDepsMock: vi.fn(() => ({
      messaging: {
        doctorSupport: {
          listOpenConversations: listMockInner,
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

import { GET } from "./route";

describe("GET /api/doctor/messages/conversations", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    listMock.mockReset();
  });

  it("returns 401 without session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when not doctor", async () => {
    getSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    const res = await GET();
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
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; conversations: unknown[] };
    expect(data.ok).toBe(true);
    expect(data.conversations).toHaveLength(1);
  });
});
