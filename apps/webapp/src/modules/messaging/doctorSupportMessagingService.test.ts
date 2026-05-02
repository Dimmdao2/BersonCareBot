import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDoctorSupportMessagingService } from "./doctorSupportMessagingService";
import type { SupportCommunicationPort, SupportConversationRow } from "@/infra/repos/pgSupportCommunication";

const { relayMock } = vi.hoisted(() => ({
  relayMock: vi.fn(async () => ({ ok: true as const, status: "accepted" as const })),
}));

vi.mock("./relayOutbound", () => ({
  relayOutbound: relayMock,
}));

function makeConversationRow(overrides: Partial<SupportConversationRow> = {}): SupportConversationRow {
  return {
    id: "conv-1",
    integratorConversationId: "integrator-conv-1",
    platformUserId: "user-1",
    integratorUserId: null,
    source: "telegram",
    adminScope: "support",
    status: "open",
    openedAt: "2026-01-01T00:00:00.000Z",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
    closeReason: null,
    channelCode: "telegram",
    channelExternalId: "987654321",
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
    ensureWebappConversationForUser: async () => ({ id: "conv-webapp-1" }),
    appendWebappMessage: async () => ({ id: "msg-webapp-1" }),
    listMessagesSince: async () => [],
    conversationExists: async () => false,
    getConversationRelayInfo: async () => null,
    getConversationIfOwnedByUser: async () => null,
    markInboundReadForUser: async () => undefined,
    markUserMessagesReadByAdmin: async () => undefined,
    countUnreadForUser: async () => 0,
    countUnreadUserMessagesForAdmin: async () => 0,
    countUnreadUserMessagesForAdminByConversation: async () => 0,
    countUnreadUserMessagesForAdminByPatient: async () => 0,
    ...overrides,
  };
}

describe("doctorSupportMessagingService", () => {
  beforeEach(() => {
    relayMock.mockReset();
    relayMock.mockResolvedValue({ ok: true as const, status: "accepted" as const });
  });

  it("returns null for unknown conversation in getMessages", async () => {
    const service = createDoctorSupportMessagingService(
      createPort({ conversationExists: async () => false }),
    );
    const res = await service.getMessages("missing", {});
    expect(res).toBeNull();
  });

  it("loads messages when conversation exists", async () => {
    const listMessagesSince = vi.fn(async () => [
      {
        id: "m1",
        integratorMessageId: "i1",
        conversationId: "conv-1",
        senderRole: "user",
        messageType: "text",
        text: "hello",
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
    ]);
    const service = createDoctorSupportMessagingService(
      createPort({ conversationExists: async () => true, listMessagesSince }),
    );

    const res = await service.getMessages("conv-1", { sinceCreatedAt: "2026-01-01T00:00:00.000Z", limit: 50 });
    expect(res?.messages).toHaveLength(1);
    expect(listMessagesSince).toHaveBeenCalledWith("conv-1", {
      sinceCreatedAt: "2026-01-01T00:00:00.000Z",
      limit: 50,
    });
  });

  it("passes unreadOnly to listOpenConversationsForAdmin", async () => {
    const listOpenConversationsForAdmin = vi.fn(async () => []);
    const service = createDoctorSupportMessagingService(
      createPort({ listOpenConversationsForAdmin }),
    );

    await service.listOpenConversations({ limit: 25, unreadOnly: true });

    expect(listOpenConversationsForAdmin).toHaveBeenCalledWith({ limit: 25, unreadOnly: true });
  });

  it("ensures a patient conversation and returns messages with unread count", async () => {
    const ensureWebappConversationForUser = vi.fn(async () => ({ id: "conv-webapp-1" }));
    const listMessagesSince = vi.fn(async () => [
      {
        id: "m1",
        integratorMessageId: "i1",
        conversationId: "conv-webapp-1",
        senderRole: "user",
        messageType: "text",
        text: "hello",
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
    ]);
    const countUnreadUserMessagesForAdminByConversation = vi.fn(async () => 1);
    const service = createDoctorSupportMessagingService(
      createPort({
        ensureWebappConversationForUser,
        listMessagesSince,
        countUnreadUserMessagesForAdminByConversation,
      }),
    );

    const res = await service.ensureConversationForPatient("patient-1");

    expect(res.conversationId).toBe("conv-webapp-1");
    expect(res.messages).toHaveLength(1);
    expect(res.unreadFromUserCount).toBe(1);
    expect(ensureWebappConversationForUser).toHaveBeenCalledWith("patient-1");
    expect(listMessagesSince).toHaveBeenCalledWith("conv-webapp-1", { sinceCreatedAt: null, limit: 100 });
    expect(countUnreadUserMessagesForAdminByConversation).toHaveBeenCalledWith("conv-webapp-1");
  });

  it("returns unread count for a patient without ensuring a conversation", async () => {
    const countUnreadUserMessagesForAdminByPatient = vi.fn(async () => 3);
    const service = createDoctorSupportMessagingService(
      createPort({ countUnreadUserMessagesForAdminByPatient }),
    );

    const count = await service.unreadFromPatient("patient-1");

    expect(count).toBe(3);
    expect(countUnreadUserMessagesForAdminByPatient).toHaveBeenCalledWith("patient-1");
  });

  it("returns not_found for missing conversation in sendAdminReply", async () => {
    const appendWebappMessage = vi.fn(async () => ({ id: "msg-webapp-1" }));
    const service = createDoctorSupportMessagingService(
      createPort({ conversationExists: async () => false, appendWebappMessage }),
    );

    const res = await service.sendAdminReply("missing", "reply");
    expect(res).toEqual({ ok: false, error: "not_found" });
    expect(appendWebappMessage).not.toHaveBeenCalled();
  });

  it("writes reply and relays outbound when conversation has channel info", async () => {
    const convRow = makeConversationRow({ channelCode: "telegram", channelExternalId: "987654321" });
    const appendWebappMessage = vi.fn(async () => ({ id: "msg-webapp-1" }));
    const service = createDoctorSupportMessagingService(
      createPort({
        getConversationRelayInfo: async () => convRow,
        appendWebappMessage,
      }),
    );

    const res = await service.sendAdminReply("conv-1", "reply");
    expect(res).toEqual({ ok: true });
    expect(appendWebappMessage).toHaveBeenCalledTimes(1);

    // Fire-and-forget — wait a tick for the promise to run
    await new Promise((r) => setTimeout(r, 0));
    expect(relayMock).toHaveBeenCalledTimes(1);
    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram", recipient: "987654321", text: "reply" }),
      undefined,
    );
  });

  it("relay не вызывается если нет channel binding в диалоге", async () => {
    const convRow = makeConversationRow({ channelCode: null, channelExternalId: null });
    const appendWebappMessage = vi.fn(async () => ({ id: "msg-webapp-1" }));
    const service = createDoctorSupportMessagingService(
      createPort({
        getConversationRelayInfo: async () => convRow,
        appendWebappMessage,
      }),
    );

    const res = await service.sendAdminReply("conv-1", "reply");
    expect(res).toEqual({ ok: true });
    expect(appendWebappMessage).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 0));
    expect(relayMock).not.toHaveBeenCalled();
  });

  it("ошибка relay не ломает sendAdminReply", async () => {
    relayMock.mockRejectedValue(new Error("network error"));
    const convRow = makeConversationRow({ channelCode: "telegram", channelExternalId: "111" });
    const appendWebappMessage = vi.fn(async () => ({ id: "msg-webapp-1" }));
    const service = createDoctorSupportMessagingService(
      createPort({
        getConversationRelayInfo: async () => convRow,
        appendWebappMessage,
      }),
    );

    const res = await service.sendAdminReply("conv-1", "reply");
    expect(res).toEqual({ ok: true });
    expect(appendWebappMessage).toHaveBeenCalledTimes(1);
    // relay error не ломает ответ API
  });

  it("relay не вызывается если getConversationRelayInfo возвращает null", async () => {
    const appendWebappMessage = vi.fn(async () => ({ id: "msg-webapp-1" }));
    const service = createDoctorSupportMessagingService(
      createPort({
        getConversationRelayInfo: async () => null,
        appendWebappMessage,
      }),
    );

    const res = await service.sendAdminReply("conv-1", "reply");
    expect(res).toEqual({ ok: false, error: "not_found" });
    await new Promise((r) => setTimeout(r, 0));
    expect(relayMock).not.toHaveBeenCalled();
  });

  it("shouldDispatch передаётся в relayOutbound как opts", async () => {
    const convRow = makeConversationRow({ channelCode: "telegram", channelExternalId: "222", platformUserId: "u-1" });
    const appendWebappMessage = vi.fn(async () => ({ id: "msg-webapp-1" }));
    const shouldDispatch = vi.fn(async () => true);
    const service = createDoctorSupportMessagingService(
      createPort({
        getConversationRelayInfo: async () => convRow,
        appendWebappMessage,
      }),
      { shouldDispatch },
    );

    await service.sendAdminReply("conv-1", "reply");
    await new Promise((r) => setTimeout(r, 0));

    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-1" }),
      expect.objectContaining({ shouldDispatch }),
    );
  });
});
