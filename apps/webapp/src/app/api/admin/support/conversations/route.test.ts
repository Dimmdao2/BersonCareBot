import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardMock, listConversationsMock, buildAppDepsMock } = vi.hoisted(() => ({
  guardMock: vi.fn(),
  listConversationsMock: vi.fn(),
  buildAppDepsMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePlatformOperationsApiContext: guardMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

import { GET } from "./route";
import {
  createPlatformSupportService,
  type PlatformSupportConversation,
} from "@/modules/messaging/platformSupportService";

describe("GET /api/admin/support/conversations", () => {
  beforeEach(() => {
    guardMock.mockReset();
    listConversationsMock.mockReset();
    buildAppDepsMock.mockReset().mockReturnValue({
      messaging: {
        platformSupport: {
          listConversations: listConversationsMock,
        },
      },
    });
  });

  it("rejects a clinic user before dependency construction or a database read", async () => {
    guardMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { ok: false, error: "forbidden" },
        { status: 403 },
      ),
    });

    const response = await GET(
      new Request("http://localhost/api/admin/support/conversations"),
    );

    expect(response.status).toBe(403);
    expect(buildAppDepsMock).not.toHaveBeenCalled();
    expect(listConversationsMock).not.toHaveBeenCalled();
  });

  it("passes the exact unanswered filter through the platform service", async () => {
    guardMock.mockResolvedValueOnce({
      ok: true,
      session: { user: { userId: "admin-1", role: "admin" } },
    });
    listConversationsMock.mockResolvedValueOnce([
      { conversationId: "conversation-1", lastSenderRole: "user" },
    ]);

    const response = await GET(
      new Request(
        "http://localhost/api/admin/support/conversations?unanswered=1&limit=25",
      ),
    );

    expect(response.status).toBe(200);
    expect(listConversationsMock).toHaveBeenCalledWith({
      unansweredOnly: true,
      limit: 25,
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      conversations: [
        { conversationId: "conversation-1", lastSenderRole: "user" },
      ],
    });
  });

  it("does not return a delivered broadcast even if the repository regresses", async () => {
    const personal: PlatformSupportConversation = {
      conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organizationId: null,
      organizationTitle: null,
      source: "telegram",
      adminScope: "default",
      status: "waiting_admin",
      openedAt: "2026-07-28T08:00:00.000Z",
      lastMessageAt: "2026-07-28T09:00:00.000Z",
      closedAt: null,
      closeReason: null,
      channelCode: "telegram",
      lastMessageText: "Помогите",
      lastSenderRole: "user",
      lastMessageIntegratorId: "telegram:user:1",
      lastMessageSource: "telegram",
      messageCount: 1,
    };
    const platformSupport = createPlatformSupportService({
      listPlatformSupportConversations: vi.fn().mockResolvedValue([
        personal,
        {
          ...personal,
          conversationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          lastMessageText: "Расписание и новости",
          lastSenderRole: "admin",
          lastMessageIntegratorId: "broadcast:audit-1:user-1",
          lastMessageSource: "doctor_broadcast",
        },
      ]),
      getPlatformSupportConversation: vi.fn().mockResolvedValue(null),
    });
    buildAppDepsMock.mockReturnValueOnce({
      messaging: { platformSupport },
    });
    guardMock.mockResolvedValueOnce({
      ok: true,
      session: { user: { userId: "admin-1", role: "admin" } },
    });

    const response = await GET(
      new Request("http://localhost/api/admin/support/conversations"),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      conversations: [{ conversationId: personal.conversationId }],
    });
  });
});
