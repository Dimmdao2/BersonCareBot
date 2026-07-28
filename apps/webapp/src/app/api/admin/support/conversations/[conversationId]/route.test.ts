import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardMock, getConversationMock, buildAppDepsMock } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  getConversationMock: vi.fn(),
  buildAppDepsMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePlatformOperationsApiContext: guardMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";

const CONVERSATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("GET /api/admin/support/conversations/:conversationId", () => {
  beforeEach(() => {
    guardMock.mockReset().mockResolvedValue({
      ok: true,
      session: { user: { userId: "admin-1", role: "admin" } },
    });
    getConversationMock.mockReset();
    buildAppDepsMock.mockReset().mockReturnValue({
      messaging: {
        platformSupport: {
          getConversation: getConversationMock,
        },
      },
    });
  });

  it("returns the existing conversation card with its personal messages", async () => {
    getConversationMock.mockResolvedValueOnce({
      conversation: { conversationId: CONVERSATION_ID, status: "open" },
      messages: [{ id: "message-1", senderRole: "user", text: "Помогите" }],
    });

    const response = await GET(
      new Request(
        `http://localhost/api/admin/support/conversations/${CONVERSATION_ID}`,
      ),
      { params: Promise.resolve({ conversationId: CONVERSATION_ID }) },
    );

    expect(response.status).toBe(200);
    expect(getConversationMock).toHaveBeenCalledWith(CONVERSATION_ID);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      conversation: { conversationId: CONVERSATION_ID },
      messages: [{ id: "message-1" }],
    });
  });

  it("validates the id only after the platform guard", async () => {
    guardMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ ok: false, error: "forbidden" }, { status: 403 }),
    });

    const response = await GET(
      new Request("http://localhost/api/admin/support/conversations/not-a-uuid"),
      { params: Promise.resolve({ conversationId: "not-a-uuid" }) },
    );

    expect(response.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
  });
});
