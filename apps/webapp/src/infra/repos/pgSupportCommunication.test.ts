import { describe, expect, it } from "vitest";
import { inMemorySupportCommunicationPort } from "./inMemorySupportCommunication";

describe("SupportCommunicationPort (in-memory)", () => {
  it("upsert conversation by integrator_conversation_id is idempotent", async () => {
    const port = inMemorySupportCommunicationPort;
    const params = {
      integratorConversationId: "conv-idemp-1",
      integratorUserId: "100",
      source: "telegram",
      adminScope: "support",
      status: "open",
      openedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    };
    const a = await port.upsertConversationFromProjection(params);
    const b = await port.upsertConversationFromProjection(params);
    expect(a.id).toBe(b.id);
    const conv = await port.getConversationWithMessages(a.id);
    expect(conv?.conversation.integratorConversationId).toBe("conv-idemp-1");
  });

  it("append message by integrator_message_id is idempotent", async () => {
    const port = inMemorySupportCommunicationPort;
    await port.upsertConversationFromProjection({
      integratorConversationId: "conv-msg-1",
      integratorUserId: null,
      source: "telegram",
      adminScope: "",
      status: "open",
      openedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    });
    const msgParams = {
      integratorMessageId: "msg-idemp-1",
      integratorConversationId: "conv-msg-1",
      senderRole: "user",
      text: "Hello",
      source: "telegram",
      createdAt: new Date().toISOString(),
    };
    const a = await port.appendConversationMessageFromProjection(msgParams);
    const b = await port.appendConversationMessageFromProjection(msgParams);
    expect(a.id).toBe(b.id);
  });

  it("question upsert and message append are idempotent", async () => {
    const port = inMemorySupportCommunicationPort;
    const qParams = {
      integratorQuestionId: "q-idemp-1",
      integratorConversationId: null,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    const qa = await port.upsertQuestionFromProjection(qParams);
    const qb = await port.upsertQuestionFromProjection(qParams);
    expect(qa.id).toBe(qb.id);

    const qmParams = {
      integratorQuestionMessageId: "qm-idemp-1",
      integratorQuestionId: "q-idemp-1",
      senderRole: "user",
      text: "Question?",
      createdAt: new Date().toISOString(),
    };
    const ma = await port.appendQuestionMessageFromProjection(qmParams);
    const mb = await port.appendQuestionMessageFromProjection(qmParams);
    expect(ma.id).toBe(mb.id);
  });

  it("delivery event append is idempotent by integratorIntentEventId", async () => {
    const port = inMemorySupportCommunicationPort;
    const params = {
      conversationMessageId: null,
      integratorIntentEventId: "evt-idemp-1",
      correlationId: "corr-idemp-1",
      channelCode: "telegram",
      status: "success",
      attempt: 1,
      reason: null,
      payloadJson: {},
      occurredAt: new Date().toISOString(),
    };
    const a = await port.appendDeliveryEventFromProjection(params);
    const b = await port.appendDeliveryEventFromProjection(params);
    expect(a.id).toBe(b.id);
  });

  it("delivery event append stores per-channel status trail", async () => {
    const port = inMemorySupportCommunicationPort;
    const { id: conversationId } = await port.upsertConversationFromProjection({
      integratorConversationId: "conv-del-1",
      integratorUserId: null,
      source: "telegram",
      adminScope: "",
      status: "open",
      openedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    });
    const msg = await port.appendConversationMessageFromProjection({
      integratorMessageId: "msg-del-1",
      integratorConversationId: "conv-del-1",
      senderRole: "admin",
      text: "Hi",
      source: "telegram",
      createdAt: new Date().toISOString(),
    });
    await port.appendDeliveryEventFromProjection({
      conversationMessageId: msg.id,
      integratorIntentEventId: "evt-1",
      correlationId: "corr-1",
      channelCode: "telegram",
      status: "success",
      attempt: 1,
      reason: null,
      payloadJson: {},
      occurredAt: new Date().toISOString(),
    });
    const conv = await port.getConversationWithMessages(conversationId);
    expect(conv).not.toBeNull();
    expect(conv!.messages.length).toBe(1);
    const trail = await port.listRecentDeliveryTrailForConversation(conversationId);
    expect(trail.length).toBe(1);
    expect(trail[0].channelCode).toBe("telegram");
    expect(trail[0].status).toBe("success");
  });

  it("platform_user_id remains null when platform_users link is absent", async () => {
    const port = inMemorySupportCommunicationPort;
    const { id } = await port.upsertConversationFromProjection({
      integratorConversationId: "conv-no-platform",
      integratorUserId: "999",
      source: "telegram",
      adminScope: "",
      status: "open",
      openedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    });
    const conv = await port.getConversationWithMessages(id);
    expect(conv).not.toBeNull();
    expect(conv!.conversation.platformUserId).toBeNull();
    expect(conv!.conversation.integratorUserId).toBe("999");
  });
});

describe("SupportCommunicationPort admin reads (in-memory)", () => {
  const port = inMemorySupportCommunicationPort;

  it("listOpenConversationsForAdmin returns open conversations", async () => {
    await port.upsertConversationFromProjection({
      integratorConversationId: "conv-admin-open-1",
      integratorUserId: "1",
      source: "telegram",
      adminScope: "support",
      status: "open",
      openedAt: "2025-01-01T10:00:00Z",
      lastMessageAt: "2025-01-01T10:01:00Z",
    });
    const list = await port.listOpenConversationsForAdmin({ limit: 50 });
    expect(list.some((c) => c.integratorConversationId === "conv-admin-open-1")).toBe(true);
  });

  it("listOpenConversationsForAdmin includes unread user count and supports unreadOnly", async () => {
    const { id } = await port.upsertConversationFromProjection({
      integratorConversationId: "conv-admin-unread-1",
      integratorUserId: "10",
      source: "telegram",
      adminScope: "support",
      status: "open",
      openedAt: "2025-01-01T10:00:00Z",
      lastMessageAt: "2025-01-01T10:03:00Z",
    });
    await port.appendConversationMessageFromProjection({
      integratorMessageId: "msg-admin-unread-1",
      integratorConversationId: "conv-admin-unread-1",
      senderRole: "user",
      text: "Unread",
      source: "telegram",
      createdAt: "2025-01-01T10:03:00Z",
    });

    const list = await port.listOpenConversationsForAdmin({ limit: 50, unreadOnly: true });
    const row = list.find((c) => c.integratorConversationId === "conv-admin-unread-1");

    expect(row?.conversationId).toBe(id);
    expect(row?.unreadFromUserCount).toBe(1);
    expect(await port.countUnreadUserMessagesForAdminByConversation(id)).toBe(1);
  });

  it("counts unread user messages for admin by patient without ensuring a new conversation", async () => {
    const patientUserId = "00000000-0000-4000-8000-000000000123";
    const { id } = await port.ensureWebappConversationForUser(patientUserId);
    await port.appendWebappMessage({
      conversationId: id,
      integratorMessageId: "msg-admin-unread-by-patient-1",
      senderRole: "user",
      text: "Unread from patient",
      source: "webapp",
      createdAt: "2025-01-01T10:04:00Z",
    });

    expect(await port.countUnreadUserMessagesForAdminByPatient(patientUserId)).toBeGreaterThanOrEqual(1);
  });

  it("listOpenConversationsForAdmin excludes closed conversations", async () => {
    await port.upsertConversationFromProjection({
      integratorConversationId: "conv-admin-closed-1",
      integratorUserId: "2",
      source: "telegram",
      adminScope: "support",
      status: "closed",
      openedAt: "2025-01-01T10:00:00Z",
      lastMessageAt: "2025-01-01T10:01:00Z",
      closedAt: "2025-01-01T10:02:00Z",
      closeReason: "resolved",
    });
    const list = await port.listOpenConversationsForAdmin({ limit: 50 });
    expect(list.some((c) => c.integratorConversationId === "conv-admin-closed-1")).toBe(false);
  });

  it("countUnreadUserMessagesForAdmin counts only open conversations (matches inbox list)", async () => {
    const baseline = await port.countUnreadUserMessagesForAdmin();

    await port.upsertConversationFromProjection({
      integratorConversationId: "conv-closed-unread",
      integratorUserId: "20",
      source: "telegram",
      adminScope: "support",
      status: "closed",
      openedAt: "2025-01-01T10:00:00Z",
      lastMessageAt: "2025-01-01T10:01:00Z",
      closedAt: "2025-01-01T10:02:00Z",
      closeReason: "resolved",
    });
    await port.appendConversationMessageFromProjection({
      integratorMessageId: "msg-in-closed",
      integratorConversationId: "conv-closed-unread",
      senderRole: "user",
      text: "Still unread but closed",
      source: "telegram",
      createdAt: "2025-01-01T10:03:00Z",
    });

    expect(await port.countUnreadUserMessagesForAdmin()).toBe(baseline);

    const { id: openId } = await port.upsertConversationFromProjection({
      integratorConversationId: "conv-open-unread",
      integratorUserId: "21",
      source: "telegram",
      adminScope: "support",
      status: "open",
      openedAt: "2025-01-01T11:00:00Z",
      lastMessageAt: "2025-01-01T11:01:00Z",
    });
    await port.appendConversationMessageFromProjection({
      integratorMessageId: "msg-in-open",
      integratorConversationId: "conv-open-unread",
      senderRole: "user",
      text: "Unread open",
      source: "telegram",
      createdAt: "2025-01-01T11:02:00Z",
    });

    expect(await port.countUnreadUserMessagesForAdmin()).toBe(baseline + 1);
    expect(await port.countUnreadUserMessagesForAdminByConversation(openId)).toBe(1);
  });

  it("getConversationByIntegratorId returns enriched conversation", async () => {
    await port.upsertConversationFromProjection({
      integratorConversationId: "conv-admin-detail-1",
      integratorUserId: "3",
      source: "telegram",
      adminScope: "support",
      status: "open",
      openedAt: "2025-01-01T10:00:00Z",
      lastMessageAt: "2025-01-01T10:00:00Z",
    });
    await port.appendConversationMessageFromProjection({
      integratorMessageId: "msg-admin-detail-1",
      integratorConversationId: "conv-admin-detail-1",
      senderRole: "user",
      text: "Help",
      source: "telegram",
      createdAt: "2025-01-01T10:01:00Z",
    });
    const conv = await port.getConversationByIntegratorId("conv-admin-detail-1");
    expect(conv).not.toBeNull();
    expect(conv!.integratorConversationId).toBe("conv-admin-detail-1");
    expect(conv!.lastMessageText).toBe("Help");
    expect(conv!.lastSenderRole).toBe("user");
  });

  it("getConversationByIntegratorId returns null for missing", async () => {
    const conv = await port.getConversationByIntegratorId("conv-nonexistent-xyz");
    expect(conv).toBeNull();
  });

  it("listUnansweredQuestionsForAdmin returns open questions", async () => {
    await port.upsertConversationFromProjection({
      integratorConversationId: "conv-q-admin-1",
      integratorUserId: "4",
      source: "telegram",
      adminScope: "support",
      status: "open",
      openedAt: "2025-01-01T10:00:00Z",
      lastMessageAt: "2025-01-01T10:00:00Z",
    });
    await port.upsertQuestionFromProjection({
      integratorQuestionId: "q-admin-1",
      integratorConversationId: "conv-q-admin-1",
      status: "open",
      createdAt: "2025-01-01T10:02:00Z",
    });
    await port.appendQuestionMessageFromProjection({
      integratorQuestionMessageId: "qm-admin-1",
      integratorQuestionId: "q-admin-1",
      senderRole: "user",
      text: "Why?",
      createdAt: "2025-01-01T10:02:00Z",
    });
    const list = await port.listUnansweredQuestionsForAdmin({ limit: 50 });
    expect(list.some((q) => q.integratorQuestionId === "q-admin-1")).toBe(true);
    const q = list.find((x) => x.integratorQuestionId === "q-admin-1");
    expect(q?.text).toBe("Why?");
  });

  it("getQuestionByIntegratorConversationId returns question for conversation", async () => {
    const q = await port.getQuestionByIntegratorConversationId("conv-q-admin-1");
    expect(q).not.toBeNull();
    expect(q!.id).toBe("q-admin-1");
    expect(q!.answered).toBe(false);
  });
});
