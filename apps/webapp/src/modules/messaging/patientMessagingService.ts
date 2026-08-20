/**
 * Сообщения поддержки для пациента (webapp thread `webapp:platform:{userId}`).
 */
import type {
  SupportCommunicationPort,
  SupportConversationMessageRow,
} from '@/modules/messaging/ports';
import { isSupportChatMessage } from '@/shared/lib/supportMessageKinds';
import {
  serializeSupportMessage,
  type SerializedSupportMessage,
} from '@/modules/messaging/serializeSupportMessage';
import { logger, serializeError } from '@/infra/logging/logger';

const MAX_LEN = 4000;

/**
 * A closed support thread stays VISIBLE and READABLE for its owner — it is history, and history is
 * never answered with "no such thing". It is only write-closed. Same predicate everywhere so the
 * composer the patient sees and the POST the server accepts can never disagree.
 */
export function isSupportConversationReadOnly(conv: {
  status: string;
  closedAt: string | null;
}): boolean {
  return conv.status !== 'open' || conv.closedAt !== null;
}

export type PatientMessagingServiceOptions = {
  /** Если true — пациент не может отправлять сообщения (этап 9, `platform_users.is_blocked`). */
  isUserMessagingBlocked?: (platformUserId: string) => Promise<boolean>;
  /** Уведомление врача в Telegram/Max после сообщения из PWA. */
  notifyDoctorOfPatientMessage?: (input: {
    organizationId: string;
    platformUserId: string;
    conversationId: string;
    messageId: string;
    messageText: string;
    patientLabel: string;
  }) => Promise<void>;
};

export function createPatientMessagingService(
  port: SupportCommunicationPort,
  options?: PatientMessagingServiceOptions,
) {
  return {
    /**
     * Гарантирует диалог и возвращает последние сообщения.
     * `ensureWebappConversationForUser` не фильтрует по статусу, поэтому здесь может вернуться уже
     * закрытое обращение — оно открывается и читается, но помечается `readOnly`, чтобы клиент не
     * рисовал форму отправки, которая заведомо будет отклонена сервером.
     */
    async bootstrap(platformUserId: string): Promise<{
      conversationId: string;
      messages: SupportConversationMessageRow[];
      readOnly: boolean;
    }> {
      const { id } = await port.ensureWebappConversationForUser(platformUserId);
      await port
        .mergeLegacySupportConversationsForPlatformUser?.(platformUserId)
        .catch((err: unknown) => {
          logger.error(
            { err: serializeError(err) },
            '[patientMessaging] merge legacy conversations error',
          );
        });
      const [conv, messages] = await Promise.all([
        port.getConversationIfOwnedByUser(id, platformUserId),
        port.listMessagesSince(id, { sinceCreatedAt: null, limit: 100 }),
      ]);
      return {
        conversationId: id,
        messages: messages.filter(isSupportChatMessage),
        readOnly: conv ? isSupportConversationReadOnly(conv) : false,
      };
    },

    /** Новые сообщения после `since` (для polling). Закрытое обращение читается как обычно. */
    async pollNew(
      platformUserId: string,
      conversationId: string,
      sinceCreatedAt: string | null,
    ): Promise<{ messages: SupportConversationMessageRow[]; readOnly: boolean } | null> {
      const conv = await port.getConversationIfOwnedByUser(conversationId, platformUserId);
      if (!conv) return null;
      const messages = await port.listMessagesSince(conversationId, {
        sinceCreatedAt: sinceCreatedAt ?? undefined,
        limit: 80,
      });
      return {
        messages: messages.filter(isSupportChatMessage),
        readOnly: isSupportConversationReadOnly(conv),
      };
    },

    async sendText(
      platformUserId: string,
      conversationId: string,
      text: string,
      patientLabel: string,
    ): Promise<{ ok: true; message: SerializedSupportMessage } | { ok: false; error: string }> {
      const conv = await port.getConversationIfOwnedByUser(conversationId, platformUserId);
      // Чужое обращение — единый ответ «нет такого» (OWASP ASVS 5.0 V8.2.2 / CWE-639).
      if (!conv) return { ok: false, error: 'not_found' };
      // Своё закрытое — существует, видно, читается; отказ честный, а не «не найдено».
      if (isSupportConversationReadOnly(conv)) {
        return { ok: false, error: 'conversation_closed' };
      }
      if (options?.isUserMessagingBlocked) {
        const blocked = await options.isUserMessagingBlocked(platformUserId);
        if (blocked) return { ok: false, error: 'blocked' };
      }
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: 'empty' };
      if (trimmed.length > MAX_LEN) return { ok: false, error: 'too_long' };
      const integratorMessageId = `webapp-msg:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      await port
        .mergeLegacySupportConversationsForPlatformUser?.(platformUserId)
        .catch((err: unknown) => {
          logger.error(
            { err: serializeError(err) },
            '[patientMessaging] merge legacy conversations error',
          );
        });
      const { id: targetConversationId } =
        await port.ensureWebappConversationForUser(platformUserId);

      const { id: messageId } = await port.appendWebappMessage({
        conversationId: targetConversationId,
        integratorMessageId,
        senderRole: 'user',
        text: trimmed,
        source: 'webapp',
        createdAt: now,
      });

      if (conv.organizationId && options?.notifyDoctorOfPatientMessage) {
        const organizationId = conv.organizationId;
        void (async () => {
          await options.notifyDoctorOfPatientMessage!({
            organizationId,
            platformUserId,
            conversationId: targetConversationId,
            messageId: integratorMessageId,
            messageText: trimmed,
            patientLabel,
          });
        })().catch((err: unknown) => {
          logger.error({ err: serializeError(err) }, '[patientMessaging] doctor notify error');
        });
      }

      const message: SupportConversationMessageRow = {
        id: messageId,
        organizationId: null,
        integratorMessageId,
        conversationId: targetConversationId,
        senderRole: 'user',
        messageType: 'text',
        text: trimmed,
        source: 'webapp',
        externalChatId: null,
        externalMessageId: null,
        deliveryStatus: null,
        createdAt: now,
        readAt: null,
        deliveredAt: now,
        mediaUrl: null,
        mediaType: null,
      };

      return { ok: true, message: serializeSupportMessage(message) };
    },

    /**
     * Квитанция «прочитано» по ОДНОМУ обращению. Закрытое обращение — не ошибка: пациент видит его
     * историю, значит имеет право её прочитать; если непрочитанных входящих в нём нет, это просто
     * no-op. Чужое обращение не совпадёт по владельцу и не изменит ни одной строки.
     */
    async markInboundRead(platformUserId: string, conversationId: string): Promise<void> {
      await port.markInboundReadForUser(conversationId, platformUserId);
    },

    async unreadCount(platformUserId: string): Promise<number> {
      await port
        .mergeLegacySupportConversationsForPlatformUser?.(platformUserId)
        .catch((err: unknown) => {
          logger.error(
            { err: serializeError(err) },
            '[patientMessaging] merge legacy conversations error',
          );
        });
      return port.countUnreadForUser(platformUserId);
    },
  };
}
