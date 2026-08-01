import type {
  SupportCommunicationPort,
  SupportConversationRow,
  SupportConversationMessageRow,
  SupportQuestionRow,
  SupportDeliveryEventRow,
} from '@/modules/messaging/ports';
import { isSupportNotificationMessage } from '@/shared/lib/supportMessageKinds';

const questionMessageTexts = new Map<string, string>();

const conversations = new Map<string, SupportConversationRow>();
const messages = new Map<string, SupportConversationMessageRow>();
const questions = new Map<string, SupportQuestionRow>();
const questionMessages: { id: string; questionId: string; integratorQuestionMessageId: string }[] =
  [];
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
      (c) => c.integratorConversationId === params.integratorConversationId,
    );
    const id = existing?.id ?? nextId('conv', ++conversationIdSeq);
    const row: SupportConversationRow = {
      id,
      organizationId: null,
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
      (m) => m.integratorMessageId === params.integratorMessageId,
    );
    if (existingMsg) return { id: existingMsg.id };

    const conv = Array.from(conversations.values()).find(
      (c) => c.integratorConversationId === params.integratorConversationId,
    );
    const conversationId = conv?.id ?? nextId('conv', ++conversationIdSeq);
    if (!conv) {
      conversations.set(conversationId, {
        id: conversationId,
        organizationId: null,
        integratorConversationId: params.integratorConversationId,
        platformUserId: null,
        integratorUserId: null,
        source: params.source,
        adminScope: '',
        status: 'open',
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
    const id = nextId('msg', ++messageIdSeq);
    const row: SupportConversationMessageRow = {
      id,
      organizationId: conv?.organizationId ?? null,
      integratorMessageId: params.integratorMessageId,
      conversationId,
      senderRole: params.senderRole,
      messageType: params.messageType ?? 'text',
      text: params.text,
      source: params.source,
      externalChatId: params.externalChatId ?? null,
      externalMessageId: params.externalMessageId ?? null,
      deliveryStatus: params.deliveryStatus ?? null,
      createdAt: params.createdAt,
      readAt: null,
      deliveredAt: null,
      mediaUrl: null,
      mediaType: null,
    };
    messages.set(id, row);
    return { id };
  },

  async setConversationStatusFromProjection(params) {
    const conv = Array.from(conversations.values()).find(
      (c) => c.integratorConversationId === params.integratorConversationId,
    );
    if (conv) {
      conv.status = params.status;
      if (params.lastMessageAt) conv.lastMessageAt = params.lastMessageAt;
      if (params.closedAt != null) conv.closedAt = params.closedAt;
      if (params.closeReason != null) conv.closeReason = params.closeReason;
      conv.updatedAt = new Date().toISOString();
    } else {
      const id = nextId('conv', ++conversationIdSeq);
      conversations.set(id, {
        id,
        organizationId: null,
        integratorConversationId: params.integratorConversationId,
        platformUserId: null,
        integratorUserId: null,
        source: 'ingest',
        adminScope: '',
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
        (x) => x.integratorConversationId === params.integratorConversationId,
      );
      conversationId = c?.id ?? null;
    }
    const existing = Array.from(questions.values()).find(
      (q) => q.integratorQuestionId === params.integratorQuestionId,
    );
    const id = existing?.id ?? nextId('q', ++questionIdSeq);
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
      (x) => x.integratorQuestionId === params.integratorQuestionId,
    );
    const questionId = q?.id ?? nextId('q', ++questionIdSeq);
    if (!q) {
      questions.set(questionId, {
        id: questionId,
        integratorQuestionId: params.integratorQuestionId,
        conversationId: null,
        status: 'open',
        createdAt: params.createdAt,
        answeredAt: null,
        updatedAt: params.createdAt,
      });
    }
    const existing = questionMessages.find(
      (m) => m.integratorQuestionMessageId === params.integratorQuestionMessageId,
    );
    if (existing) return { id: existing.id };
    const id = nextId('qm', ++messageIdSeq);
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
    const id = nextId('del', ++deliveryIdSeq);
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

  async getConversationWithMessages(conversationId, organizationId) {
    const conversation = conversations.get(conversationId);
    if (!conversation || (organizationId != null && conversation.organizationId !== organizationId))
      return null;
    const messagesList = Array.from(messages.values())
      .filter(
        (m) =>
          m.conversationId === conversationId &&
          (organizationId == null || m.organizationId === organizationId),
      )
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
    const limit = typeof params.limit === 'number' && params.limit > 0 ? params.limit : 20;
    const source =
      typeof params.source === 'string' && params.source.trim() ? params.source.trim() : null;
    let list = Array.from(conversations.values()).filter(
      (c) => c.status !== 'closed' && c.closedAt == null && (source == null || c.source === source),
    );
    const lastChatMessage = (conversationId: string) =>
      Array.from(messages.values())
        .filter((m) => m.conversationId === conversationId)
        .filter((m) => !isSupportNotificationMessage(m))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const unreadCount = (conversationId: string) =>
      Array.from(messages.values()).filter(
        (m) => m.conversationId === conversationId && m.senderRole === 'user' && m.readAt == null,
      ).length;
    list = list.filter((c) => lastChatMessage(c.id) != null);
    if (params.unreadOnly) {
      list = list.filter((c) => unreadCount(c.id) > 0);
    }
    list = list
      .sort((a, b) => {
        const aUnread = unreadCount(a.id) > 0;
        const bUnread = unreadCount(b.id) > 0;
        if (aUnread !== bUnread) return aUnread ? -1 : 1;
        return (
          new Date(lastChatMessage(b.id)?.createdAt ?? b.lastMessageAt).getTime() -
          new Date(lastChatMessage(a.id)?.createdAt ?? a.lastMessageAt).getTime()
        );
      })
      .slice(0, limit);
    return list.map((c) => {
      const lastMsg = lastChatMessage(c.id);
      return {
        conversationId: c.id,
        integratorConversationId: c.integratorConversationId,
        source: c.source,
        integratorUserId: c.integratorUserId,
        adminScope: c.adminScope,
        status: c.status,
        openedAt: c.openedAt,
        lastMessageAt: c.lastMessageAt,
        closedAt: c.closedAt,
        closeReason: c.closeReason,
        displayName: '',
        phoneNormalized: null,
        channelExternalId: c.channelExternalId,
        lastMessageText: lastMsg?.text ?? null,
        lastSenderRole: lastMsg?.senderRole ?? null,
        unreadFromUserCount: unreadCount(c.id),
      };
    });
  },

  async mergeLegacySupportConversationsForPlatformUser(_platformUserId) {
    return { mergedConversationCount: 0, movedMessageCount: 0 };
  },

  async ensureWebappConversationForUser(platformUserId) {
    const key = `webapp:platform:${platformUserId}`;
    let c = Array.from(conversations.values()).find((x) => x.integratorConversationId === key);
    if (!c) {
      const id = nextId('conv', ++conversationIdSeq);
      c = {
        id,
        organizationId: null,
        integratorConversationId: key,
        platformUserId,
        integratorUserId: null,
        source: 'webapp',
        adminScope: 'support',
        status: 'open',
        openedAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        closedAt: null,
        closeReason: null,
        channelCode: null,
        channelExternalId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      conversations.set(id, c);
    } else if (c.platformUserId !== platformUserId) {
      c.platformUserId = platformUserId;
    }
    return { id: c.id, organizationId: c.organizationId };
  },

  async appendWebappMessage(params) {
    const existing = Array.from(messages.values()).find(
      (m) => m.integratorMessageId === params.integratorMessageId,
    );
    if (existing) return { id: existing.id, created: false };
    const id = nextId('msg', ++messageIdSeq);
    const row: SupportConversationMessageRow = {
      id,
      organizationId: conversations.get(params.conversationId)?.organizationId ?? null,
      integratorMessageId: params.integratorMessageId,
      conversationId: params.conversationId,
      senderRole: params.senderRole,
      messageType: 'text',
      text: params.text,
      source: params.source,
      externalChatId: null,
      externalMessageId: null,
      deliveryStatus: null,
      createdAt: params.createdAt,
      readAt: null,
      deliveredAt: null,
      mediaUrl: params.mediaUrl ?? null,
      mediaType: params.mediaType ?? null,
    };
    messages.set(id, row);
    const conv = conversations.get(params.conversationId);
    if (conv) {
      conv.lastMessageAt = params.createdAt;
      conv.updatedAt = new Date().toISOString();
    }
    return { id, created: true };
  },

  async listMessagesSince(conversationId, params) {
    let list = Array.from(messages.values()).filter((m) => m.conversationId === conversationId);
    if (params.sinceCreatedAt) {
      list = list.filter(
        (m) => new Date(m.createdAt).getTime() > new Date(params.sinceCreatedAt!).getTime(),
      );
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return list.slice(0, params.limit);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    list = list.slice(0, params.limit);
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return list;
  },

  async conversationExists(conversationId) {
    return conversations.has(conversationId);
  },

  async getConversationRelayInfo(conversationId) {
    const c = conversations.get(conversationId);
    if (!c) return null;
    return {
      id: c.id,
      platformUserId: c.platformUserId,
      channelCode: c.channelCode,
      channelExternalId: c.channelExternalId,
    };
  },

  async getConversationIfOwnedByUser(conversationId, platformUserId) {
    const c = conversations.get(conversationId);
    if (!c || c.platformUserId !== platformUserId) return null;
    return c;
  },

  /** Mirrors the scoped pg predicate: this conversation only, owned by this user, any status. */
  async markInboundReadForUser(conversationId, platformUserId) {
    const c = conversations.get(conversationId);
    if (!c || c.platformUserId !== platformUserId) return;
    const now = new Date().toISOString();
    for (const m of messages.values()) {
      if (
        m.conversationId === conversationId &&
        m.senderRole !== 'user' &&
        !isSupportNotificationMessage(m) &&
        m.readAt == null
      ) {
        m.readAt = now;
      }
    }
  },

  async markInboundMessagesReadForUser(platformUserId, messageIds) {
    const ids = new Set(messageIds.map((id) => String(id).trim()).filter(Boolean));
    if (ids.size === 0) return;
    const convIds = new Set(
      Array.from(conversations.values())
        .filter((row) => row.platformUserId === platformUserId)
        .map((row) => row.id),
    );
    const now = new Date().toISOString();
    for (const m of messages.values()) {
      if (!ids.has(m.id)) continue;
      if (!convIds.has(m.conversationId)) continue;
      if (m.senderRole === 'user' || isSupportNotificationMessage(m) || m.readAt != null) continue;
      m.readAt = now;
    }
  },

  async markNotificationMessagesReadForUser(platformUserId) {
    const convIds = new Set(
      Array.from(conversations.values())
        .filter((row) => row.platformUserId === platformUserId)
        .map((row) => row.id),
    );
    const now = new Date().toISOString();
    for (const m of messages.values()) {
      if (!convIds.has(m.conversationId)) continue;
      if (m.senderRole === 'user' || !isSupportNotificationMessage(m) || m.readAt != null) continue;
      m.readAt = now;
    }
  },

  async markUserMessagesReadByAdmin(conversationId) {
    for (const m of messages.values()) {
      if (m.conversationId === conversationId && m.senderRole === 'user' && m.readAt == null) {
        m.readAt = new Date().toISOString();
      }
    }
  },

  async countUnreadForUser(platformUserId) {
    const convIds = new Set(
      Array.from(conversations.values())
        .filter((c) => c.platformUserId === platformUserId)
        .map((c) => c.id),
    );
    let n = 0;
    for (const m of messages.values()) {
      if (
        convIds.has(m.conversationId) &&
        m.senderRole !== 'user' &&
        !isSupportNotificationMessage(m) &&
        m.readAt == null
      )
        n += 1;
    }
    return n;
  },

  async countUnreadNotificationsForUser(platformUserId) {
    const convIds = new Set(
      Array.from(conversations.values())
        .filter((c) => c.platformUserId === platformUserId)
        .map((c) => c.id),
    );
    let n = 0;
    for (const m of messages.values()) {
      if (
        convIds.has(m.conversationId) &&
        m.senderRole !== 'user' &&
        isSupportNotificationMessage(m) &&
        m.readAt == null
      )
        n += 1;
    }
    return n;
  },

  async listUnreadInboundAdminMessagesForUser(platformUserId, conversationId) {
    const convIds = new Set(
      Array.from(conversations.values())
        .filter((c) => c.platformUserId === platformUserId && c.id === conversationId)
        .map((c) => c.id),
    );
    return [...messages.values()]
      .filter(
        (m) =>
          convIds.has(m.conversationId) &&
          m.senderRole !== 'user' &&
          !isSupportNotificationMessage(m) &&
          m.readAt == null,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((m) => ({ id: m.id, text: m.text }));
  },

  async listNotificationMessagesForUser(platformUserId, limit) {
    const convIds = new Set(
      Array.from(conversations.values())
        .filter((c) => c.platformUserId === platformUserId)
        .map((c) => c.id),
    );
    const lim = Math.min(Math.max(limit, 1), 200);
    const list = [...messages.values()]
      .filter(
        (m) =>
          convIds.has(m.conversationId) &&
          m.senderRole !== 'user' &&
          isSupportNotificationMessage(m),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, lim)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return list;
  },

  async countUnreadUserMessagesForAdmin({ organizationId } = {}) {
    let n = 0;
    for (const m of messages.values()) {
      const conversation = conversations.get(m.conversationId);
      if (!conversation || conversation.organizationId !== organizationId) continue;
      const c = conversations.get(m.conversationId);
      if (!c || c.status === 'closed' || c.closedAt != null) continue;
      if (m.senderRole === 'user' && m.readAt == null) n += 1;
    }
    return n;
  },

  async countUnreadUserMessagesForAdminByConversation(conversationId) {
    let n = 0;
    for (const m of messages.values()) {
      if (m.conversationId === conversationId && m.senderRole === 'user' && m.readAt == null)
        n += 1;
    }
    return n;
  },

  async countUnreadUserMessagesForAdminByPatient(platformUserId, organizationId) {
    const convIds = new Set(
      Array.from(conversations.values())
        .filter((c) => c.platformUserId === platformUserId && c.organizationId === organizationId)
        .map((c) => c.id),
    );
    let n = 0;
    for (const m of messages.values()) {
      if (convIds.has(m.conversationId) && m.senderRole === 'user' && m.readAt == null) n += 1;
    }
    return n;
  },
};
