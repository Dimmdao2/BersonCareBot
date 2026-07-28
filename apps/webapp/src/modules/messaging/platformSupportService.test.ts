import { describe, expect, it, vi } from "vitest";
import {
  createPlatformSupportService,
  type PlatformSupportConversation,
  type PlatformSupportConversationDetail,
  type PlatformSupportPort,
} from "./platformSupportService";

const baseConversation: PlatformSupportConversation = {
  conversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  organizationTitle: "Клиника",
  source: "webapp",
  adminScope: "support",
  status: "open",
  openedAt: "2026-07-28T08:00:00.000Z",
  lastMessageAt: "2026-07-28T09:00:00.000Z",
  closedAt: null,
  closeReason: null,
  channelCode: "webapp",
  lastMessageText: "Нужна помощь",
  lastSenderRole: "user",
  lastMessageIntegratorId: "webapp-msg:user-1",
  lastMessageSource: "webapp",
  messageCount: 1,
};

function createPort(
  overrides: Partial<PlatformSupportPort>,
): PlatformSupportPort {
  return {
    listPlatformSupportConversations: vi.fn().mockResolvedValue([]),
    getPlatformSupportConversation: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe("platformSupportService", () => {
  it("does not expose broadcast and lifecycle delivery copies as support conversations", async () => {
    const listPlatformSupportConversations = vi.fn().mockResolvedValue([
      baseConversation,
      {
        ...baseConversation,
        conversationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        lastMessageIntegratorId: "broadcast:audit-1:user-1",
        lastMessageSource: "doctor_broadcast",
        lastMessageText: "Расписание и новости",
      },
      {
        ...baseConversation,
        conversationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        lastMessageIntegratorId: "booking-created:appointment-1:user-1",
        lastMessageSource: "legacy",
      },
    ]);
    const service = createPlatformSupportService(
      createPort({ listPlatformSupportConversations }),
    );

    await expect(service.listConversations({})).resolves.toEqual([
      baseConversation,
    ]);
  });

  it("defines «без ответа» only by the last personal sender being the user", async () => {
    const answered = {
      ...baseConversation,
      conversationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      lastSenderRole: "admin",
      lastMessageText: "Ответ поддержки",
    };
    const listPlatformSupportConversations = vi
      .fn()
      // A port regression must not make an answered row pass the service boundary.
      .mockResolvedValue([baseConversation, answered]);
    const service = createPlatformSupportService(
      createPort({ listPlatformSupportConversations }),
    );

    await expect(
      service.listConversations({ unansweredOnly: true }),
    ).resolves.toEqual([baseConversation]);
    expect(listPlatformSupportConversations).toHaveBeenCalledWith({
      unansweredOnly: true,
      limit: 100,
    });
  });

  it("removes broadcast copies from the conversation card as well", async () => {
    const detail: PlatformSupportConversationDetail = {
      conversation: {
        ...baseConversation,
        messageCount: 2,
      },
      messages: [
        {
          id: "message-1",
          integratorMessageId: "webapp-msg:user-1",
          senderRole: "user",
          messageType: "text",
          text: "Нужна помощь",
          source: "webapp",
          createdAt: baseConversation.lastMessageAt,
          mediaUrl: null,
          mediaType: null,
        },
        {
          id: "message-2",
          integratorMessageId: "broadcast:audit-1:user-1",
          senderRole: "admin",
          messageType: "text",
          text: "Расписание и новости",
          source: "doctor_broadcast",
          createdAt: "2026-07-28T10:00:00.000Z",
          mediaUrl: null,
          mediaType: null,
        },
      ],
    };
    const service = createPlatformSupportService(
      createPort({
        getPlatformSupportConversation: vi.fn().mockResolvedValue(detail),
      }),
    );

    const result = await service.getConversation(baseConversation.conversationId);
    expect(result?.messages.map((message) => message.id)).toEqual(["message-1"]);
  });
});
