import type {
  SupportCommunicationPort,
  SupportConversationRow,
  SupportConversationMessageRow,
  SupportQuestionRow,
  SupportDeliveryEventRow,
} from "./pgSupportCommunication";

const questionMessageTexts = new Map<string, string>();

const conversations = new Map<string, SupportConversationRow>();
const messages = new Map<string, SupportConversationMessageRow>();
const questions = new Map<string, SupportQuestionRow>();
const questionMessages: { id: string; questionId: string; integratorQuestionMessageId: string }[] = [];
const deliveryEvents: SupportDeliveryEventRow[] = [];
let conversationIdSeq = 0;
let messageIdSeq = 0;
let questionIdSeq = 0;
let deliveryIdSeq = 0;

function nextId(prefix: string, seq: number): string {
  return `${prefix}-${Date.now()}-${seq}`;
}

export const inMemorySupportCommunicationPort: SupportCommunicationPort = {
  async upsertConversationFromProjection(params) {
    const existing = Array.from(conversations.values()).find(
      (c) => c.integratorConversationId === params.integratorConversationId
    );
    const id = existing?.id ?? nextId("conv", ++conversationIdSeq);
    const row: SupportConversationRow = {
      id,
      integratorConversationId: params.integratorConversationId,
      platformUserId: null,
      integratorUserId: params.integratorUserId,
      source: params.source,
      adminScope: params.adminScope,
      status: params.status,
      openedAt: params.openedAt,
      lastMessageAt: params.lastMessageAt,
      closedAt: params.closedAt ?? null,
      closeReason: params.closeReason ?? null,
      channelCode: params.channelCode ?? null,
      channelExternalId: params.channelExternalId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    conversations.set(id, row);
    return { id };
  },

  async appendConversationMessageFromProjection(params) {
    const existingMsg = Array.from(messages.values()).find(
      (m) => m.integratorMessageId === params.integratorMessageId
    );
    if (existingMsg) return { id: existingMsg.id };

    const conv = Array.from(conversations.values()).find(
      (c) => c.integratorConversationId === params.integratorConversationId
    );
    const conversationId = conv?.id ?? nextId("conv", ++conversationIdSeq);
    if (!conv) {
      conversations.set(conversationId, {
        id: conversationId,
        integratorConversationId: params.integratorConversationId,
        platformUserId: null,
        integratorUserId: null,
        source: params.source,
        adminScope: "",
        status: "open",
        openedAt: params.createdAt,
        lastMessageAt: params.createdAt,
        closedAt: null,
        closeReason: null,
        channelCode: null,
        channelExternalId: null,
        createdAt: params.createdAt,
        updatedAt: params.createdAt,
      });
    }
    const id = nextId("msg", ++messageIdSeq);
    const row: SupportConversationMessageRow = {
      id,
      integratorMessageId: params.integratorMessageId,
      conversationId,
      senderRole: params.senderRole,
      messageType: params.messageType ?? "text",
      text: params.text,
      source: params.source,
      externalChatId: params.externalChatId ?? null,
      externalMessageId: params.externalMessageId ?? null,
      deliveryStatus: params.deliveryStatus ?? null,
      createdAt: params.createdAt,
    };
    messages.set(id, row);
    return { id };
  },

  async setConversationStatusFromProjection(params) {
    const conv = Array.from(conversations.values()).find(
      (c) => c.integratorConversationId === params.integratorConversationId
    );
    if (conv) {
      conv.status = params.status;
      if (params.lastMessageAt) conv.lastMessageAt = params.lastMessageAt;
      if (params.closedAt != null) conv.closedAt = params.closedAt;
      if (params.closeReason != null) conv.closeReason = params.closeReason;
      conv.updatedAt = new Date().toISOString();
    } else {
      const id = nextId("conv", ++conversationIdSeq);
      conversations.set(id, {
        id,
        integratorConversationId: params.integratorConversationId,
        platformUserId: null,
        integratorUserId: null,
        source: "ingest",
        adminScope: "",
        status: params.status,
        openedAt: params.lastMessageAt ?? new Date().toISOString(),
        lastMessageAt: params.lastMessageAt ?? new Date().toISOString(),
        closedAt: params.closedAt ?? null,
        closeReason: params.closeReason ?? null,
        channelCode: null,
        channelExternalId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  },

  async upsertQuestionFromProjection(params) {
    let conversationId: string | null = null;
    if (params.integratorConversationId) {
      const c = Array.from(conversations.values()).find(
        (x) => x.integratorConversationId === params.integratorConversationId
      );
      conversationId = c?.id ?? null;
    }
    const existing = Array.from(questions.values()).find(
      (q) => q.integratorQuestionId === params.integratorQuestionId
    );
    const id = existing?.id ?? nextId("q", ++questionIdSeq);
    const row: SupportQuestionRow = {
      id,
      integratorQuestionId: params.integratorQuestionId,
      conversationId,
      status: params.status,
      createdAt: params.createdAt,
      answeredAt: params.answeredAt ?? null,
      updatedAt: new Date().toISOString(),
    };
    questions.set(id, row);
    return { id };
  },

  async appendQuestionMessageFromProjection(params) {
    const q = Array.from(questions.values()).find(
      (x) => x.integratorQuestionId === params.integratorQuestionId
    );
    const questionId = q?.id ?? nextId("q", ++questionIdSeq);
    if (!q) {
      questions.set(questionId, {
        id: questionId,
        integratorQuestionId: params.integratorQuestionId,
        conversationId: null,
        status: "open",
        createdAt: params.createdAt,
        answeredAt: null,
        updatedAt: params.createdAt,
      });
    }
    const existing = questionMessages.find(
      (m) => m.integratorQuestionMessageId === params.integratorQuestionMessageId
    );
    if (existing) return { id: existing.id };
    const id = nextId("qm", ++messageIdSeq);
    questionMessageTexts.set(params.integratorQuestionId, params.text);
    questionMessages.push({
      id,
      questionId,
      integratorQuestionMessageId: params.integratorQuestionMessageId,
    });
    return { id };
  },

  async appendDeliveryEventFromProjection(params) {
    if (params.integratorIntentEventId) {
      const existing = deliveryEvents.find(
        (e) => e.integratorIntentEventId === params.integratorIntentEventId,
      );
      if (existing) return { id: existing.id };
    }
    const id = nextId("del", ++deliveryIdSeq);
    deliveryEvents.push({
      id,
      conversationMessageId: params.conversationMessageId,
      integratorIntentEventId: params.integratorIntentEventId,
      correlationId: params.correlationId,
      channelCode: params.channelCode,
      status: params.status,
      attempt: params.attempt,
      reason: params.reason,
      payloadJson: params.payloadJson ?? {},
      occurredAt: params.occurredAt,
    });
    return { id };
  },

  async listConversationsByUser(platformUserId) {
    return Array.from(conversations.values())
      .filter((c) => c.platformUserId === platformUserId)
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  },

  async getConversationWithMessages(conversationId) {
    const conversation = conversations.get(conversationId);
    if (!conversation) return null;
    const messagesList = Array.from(messages.values())
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return { conversation, messages: messagesList };
  },

  async listQuestionsByUser(platformUserId) {
    const convIds = Array.from(conversations.values())
      .filter((c) => c.platformUserId === platformUserId)
      .map((c) => c.id);
    return Array.from(questions.values())
      .filter((q) => q.conversationId && convIds.includes(q.conversationId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async listRecentDeliveryTrailForConversation(conversationId, limit = 50) {
    const msgIds = Array.from(messages.values())
      .filter((m) => m.conversationId === conversationId)
      .map((m) => m.id);
    return deliveryEvents
      .filter((e) => e.conversationMessageId && msgIds.includes(e.conversationMessageId))
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, limit);
  },

  async listOpenConversationsForAdmin(params) {
    const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 20;
    const source = typeof params.source === "string" && params.source.trim() ? params.source.trim() : null;
    let list = Array.from(conversations.values()).filter(
      (c) =>
        c.status !== "closed" &&
        c.closedAt == null &&
        (source == null || c.source === source)
    );
    list = list.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()).slice(0, limit);
    return list.map((c) => {
      const lastMsg = Array.from(messages.values())
        .filter((m) => m.conversationId === c.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      return {
        integratorConversationId: c.integratorConversationId,
        source: c.source,
        integratorUserId: c.integratorUserId,
        adminScope: c.adminScope,
        status: c.status,
        openedAt: c.openedAt,
        lastMessageAt: c.lastMessageAt,
        closedAt: c.closedAt,
        closeReason: c.closeReason,
        displayName: "",
        phoneNormalized: null,
        channelExternalId: c.channelExternalId,
        lastMessageText: lastMsg?.text ?? null,
        lastSenderRole: lastMsg?.senderRole ?? null,
      };
    });
  },

  async getConversationByIntegratorId(integratorConversationId) {
    const c = Array.from(conversations.values()).find(
      (x) => x.integratorConversationId === integratorConversationId
    );
    if (!c) return null;
    const lastMsg = Array.from(messages.values())
      .filter((m) => m.conversationId === c.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const userMsg = Array.from(messages.values())
      .filter((m) => m.conversationId === c.id && m.senderRole === "user" && m.externalChatId != null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    return {
      integratorConversationId: c.integratorConversationId,
      source: c.source,
      integratorUserId: c.integratorUserId,
      adminScope: c.adminScope,
      status: c.status,
      openedAt: c.openedAt,
      lastMessageAt: c.lastMessageAt,
      closedAt: c.closedAt,
      closeReason: c.closeReason,
      displayName: "",
      phoneNormalized: null,
      channelExternalId: c.channelExternalId,
      lastMessageText: lastMsg?.text ?? null,
      lastSenderRole: lastMsg?.senderRole ?? null,
      userChatId: userMsg?.externalChatId ?? null,
    };
  },

  async listUnansweredQuestionsForAdmin(params) {
    const limit = typeof params.limit === "number" && params.limit > 0 ? params.limit : 50;
    let list = Array.from(questions.values()).filter((q) => q.status !== "answered");
    list = list
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
    return list.map((q) => {
      const conv = q.conversationId
        ? Array.from(conversations.values()).find((c) => c.id === q.conversationId)
        : null;
      const text = questionMessageTexts.get(q.integratorQuestionId) ?? "";
      return {
        integratorQuestionId: q.integratorQuestionId,
        integratorConversationId: conv?.integratorConversationId ?? null,
        text,
        createdAt: q.createdAt,
        answered: q.status === "answered",
        answeredAt: q.answeredAt,
        displayName: "",
        phoneNormalized: null,
        channelExternalId: conv?.channelExternalId ?? null,
      };
    });
  },

  async getQuestionByIntegratorConversationId(integratorConversationId) {
    const conv = Array.from(conversations.values()).find(
      (c) => c.integratorConversationId === integratorConversationId
    );
    if (!conv) return null;
    const q = Array.from(questions.values())
      .filter((x) => x.conversationId === conv.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (!q) return null;
    return { id: q.integratorQuestionId, answered: q.status === "answered" };
  },
};
