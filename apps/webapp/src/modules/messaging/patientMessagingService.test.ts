import { describe, expect, it, vi } from "vitest";
import { createPatientMessagingService } from "./patientMessagingService";
import type { SupportCommunicationPort, SupportConversationRow } from "@/infra/repos/pgSupportCommunication";

function makeConversationRow(overrides: Partial<SupportConversationRow> = {}): SupportConversationRow {
  return {
    id: "conv-1",
    integratorConversationId: "webapp:platform:user-1",
    platformUserId: "user-1",
    integratorUserId: null,
    source: "webapp",
    adminScope: "support",
    status: "open",
    openedAt: "2026-01-01T00:00:00.000Z",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
    closeReason: null,
    channelCode: null,
    channelExternalId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function createPort(overrides: Partial<SupportCommunicationPort> = {}): SupportCommunicationPort {
  return {
    upsertConversationFromProjection: async () => ({ id: "conv-1" }),
    appendConversationMessageFromProjection: async () => ({ id: "msg-1" }),
    setConversationStatusFromProjection: async () => undefined,
    upsertQuestionFromProjection: async () => ({ id: "q-1" }),
    appendQuestionMessageFromProjection: async () => ({ id: "qm-1" }),
    appendDeliveryEventFromProjection: async () => ({ id: "de-1" }),
    listConversationsByUser: async () => [],
    getConversationWithMessages: async () => null,
    listQuestionsByUser: async () => [],
    listRecentDeliveryTrailForConversation: async () => [],
    listOpenConversationsForAdmin: async () => [],
    getConversationByIntegratorId: async () => null,
    listUnansweredQuestionsForAdmin: async () => [],
    getQuestionByIntegratorConversationId: async () => null,
    ensureWebappConversationForUser: async () => ({ id: "conv-1" }),
    mergeLegacySupportConversationsForPlatformUser: async () => ({ mergedConversationCount: 0, movedMessageCount: 0 }),
    appendWebappMessage: async () => ({ id: "msg-webapp-1", created: true }),
    listMessagesSince: async () => [],
    conversationExists: async () => true,
    getConversationRelayInfo: async () => null,
    getConversationIfOwnedByUser: async () => makeConversationRow(),
    markInboundReadForUser: async () => undefined,
    markInboundMessagesReadForUser: async () => undefined,
    markNotificationMessagesReadForUser: async () => undefined,
    markUserMessagesReadByAdmin: async () => undefined,
    countUnreadForUser: async () => 0,
    countUnreadNotificationsForUser: async () => 0,
    listUnreadInboundAdminMessagesForUser: async () => [],
    listNotificationMessagesForUser: async () => [],
    countUnreadUserMessagesForAdmin: async () => 0,
    countUnreadUserMessagesForAdminByConversation: async () => 0,
    countUnreadUserMessagesForAdminByPatient: async () => 0,
    ...overrides,
  };
}

describe("patientMessagingService", () => {
  it("filters broadcast and lifecycle notifications from patient chat bootstrap and polling", async () => {
    const messages = [
      {
        id: "m1",
        integratorMessageId: "webapp-msg:1",
        conversationId: "conv-1",
        senderRole: "admin",
        messageType: "text",
        text: "doctor reply",
        source: "webapp",
        externalChatId: null,
        externalMessageId: null,
        deliveryStatus: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        readAt: null,
        deliveredAt: null,
        mediaUrl: null,
        mediaType: null,
      },
      {
        id: "m2",
        integratorMessageId: "broadcast:audit-1:user-1",
        conversationId: "conv-1",
        senderRole: "admin",
        messageType: "text",
        text: "broadcast",
        source: "doctor_broadcast",
        externalChatId: null,
        externalMessageId: null,
        deliveryStatus: null,
        createdAt: "2026-01-01T00:01:00.000Z",
        readAt: null,
        deliveredAt: null,
        mediaUrl: null,
        mediaType: null,
      },
      {
        id: "m3",
        integratorMessageId: "booking-rescheduled:booking-1",
        conversationId: "conv-1",
        senderRole: "admin",
        messageType: "text",
        text: "booking",
        source: "appointment_lifecycle",
        externalChatId: null,
        externalMessageId: null,
        deliveryStatus: null,
        createdAt: "2026-01-01T00:02:00.000Z",
        readAt: null,
        deliveredAt: null,
        mediaUrl: null,
        mediaType: null,
      },
    ];
    const listMessagesSince = vi.fn(async () => messages);
    const service = createPatientMessagingService(createPort({ listMessagesSince }));

    const boot = await service.bootstrap("user-1");
    const polled = await service.pollNew("user-1", "conv-1", null);

    expect(boot.messages.map((message) => message.text)).toEqual(["doctor reply"]);
    expect(polled?.messages.map((message) => message.text)).toEqual(["doctor reply"]);
  });
});
