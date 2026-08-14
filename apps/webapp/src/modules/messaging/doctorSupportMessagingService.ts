/**
 * Просмотр диалогов поддержки врачом (MVP: все открытые диалоги из projection).
 */
import type {
  AdminConversationListRow,
  SupportCommunicationPort,
  SupportConversationMessageRow,
} from '@/modules/messaging/ports';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';
import { isSupportChatMessage } from '@/shared/lib/supportMessageKinds';
import { logger, serializeError } from '@/infra/logging/logger';
import { env } from '@/config/env';
import { relayOutbound, type RelayOutboundDeps } from './relayOutbound';
import {
  buildPatientMessagesOpenUrl,
  buildPersonalChatNotificationText,
  type NotifyPatientDoctorReplyParams,
} from './notifyPatientDoctorReply';

const MAX_LEN = 4000;

export type DoctorSupportMessagingServiceOpts = RelayOutboundDeps & {
  /** Fan-out push / bot / email по настройкам пациента (`is_enabled_for_messages`). */
  notifyPatientOfDoctorReply?: (params: NotifyPatientDoctorReplyParams) => Promise<void>;
};

export function createDoctorSupportMessagingService(
  port: SupportCommunicationPort,
  opts?: DoctorSupportMessagingServiceOpts,
) {
  return {
    listOpenConversations(params: {
      limit?: number;
      unreadOnly?: boolean;
      organizationId?: string;
      visibilityActor: PatientVisibilityActor;
    }): Promise<AdminConversationListRow[]> {
      return port.listOpenConversationsForAdmin({
        limit: params.limit ?? 50,
        unreadOnly: params.unreadOnly === true,
        organizationId: params.organizationId,
        visibilityActor: params.visibilityActor,
      });
    },

    async ensureConversationForPatient(platformUserId: string): Promise<{
      conversationId: string;
      messages: SupportConversationMessageRow[];
      unreadFromUserCount: number;
    }> {
      const { id } = await port.ensureWebappConversationForUser(platformUserId);
      const messages = await port.listMessagesSince(id, { sinceCreatedAt: null, limit: 100 });
      const unreadFromUserCount = await port.countUnreadUserMessagesForAdminByConversation(id);
      return {
        conversationId: id,
        messages: messages.filter(isSupportChatMessage),
        unreadFromUserCount,
      };
    },

    async getMessages(
      conversationId: string,
      params: { sinceCreatedAt?: string | null; limit?: number; organizationId?: string },
    ): Promise<{ messages: SupportConversationMessageRow[] } | null> {
      const exists = await port.conversationExists(conversationId, params.organizationId);
      if (!exists) return null;
      const messages = await port.listMessagesSince(conversationId, {
        sinceCreatedAt: params.sinceCreatedAt ?? null,
        limit: params.limit ?? 100,
        ...(params.organizationId ? { organizationId: params.organizationId } : {}),
      });
      return { messages: messages.filter(isSupportChatMessage) };
    },

    async sendAdminReply(
      conversationId: string,
      text: string,
      organizationId?: string,
      senderDisplayName?: string,
      /** Client-supplied key: same key on retry ⇒ same `integratorMessageId`, so the unique
       * constraint on `support_conversation_messages.integrator_message_id` dedupes the write
       * and the patient is not notified twice. Falls back to a fresh id for legacy callers. */
      idempotencyKey?: string,
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      const convInfo = await port.getConversationRelayInfo(conversationId, organizationId);
      if (!convInfo) return { ok: false, error: 'not_found' };
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: 'empty' };
      if (trimmed.length > MAX_LEN) return { ok: false, error: 'too_long' };
      const integratorMessageId = idempotencyKey
        ? `webapp-msg:${conversationId}:${idempotencyKey}`
        : `webapp-msg:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const channelCode = convInfo.channelCode ?? null;
      const channelExternalId = convInfo.channelExternalId ?? null;
      const platformUserId = convInfo.platformUserId ?? null;

      const { created } = await port.appendWebappMessage({
        conversationId,
        integratorMessageId,
        senderRole: 'admin',
        text: trimmed,
        source: 'webapp',
        createdAt: now,
        ...(organizationId ? { organizationId } : {}),
      });

      if (!created) {
        // Same idempotencyKey as an earlier call: message already appended and the
        // patient already notified — do not relay a second time.
        return { ok: true };
      }

      if (platformUserId && convInfo.organizationId && opts?.notifyPatientOfDoctorReply) {
        opts
          .notifyPatientOfDoctorReply({
            organizationId: convInfo.organizationId,
            platformUserId,
            messageId: integratorMessageId,
            text: trimmed,
            senderDisplayName: senderDisplayName?.trim() || undefined,
          })
          .catch((err: unknown) => {
            logger.error({ err: serializeError(err) }, '[doctorSupport] patient notify error');
          });
      } else if (channelCode && channelExternalId) {
        // Legacy: диалог без platform_user_id — только канал из projection
        const senderScope =
          channelCode === 'telegram' || channelCode === 'max' ? 'clinic_required' : undefined;
        relayOutbound(
          {
            messageId: integratorMessageId,
            ...(convInfo.organizationId ? { organizationId: convInfo.organizationId } : {}),
            channel: channelCode,
            recipient: channelExternalId,
            text: `${buildPersonalChatNotificationText(
              senderDisplayName,
              'specialist',
            )}\n\n${buildPatientMessagesOpenUrl(env.APP_BASE_URL)}`,
            ...(senderScope ? { senderScope } : {}),
          },
          opts,
        ).catch((err: unknown) => {
          logger.error({ err: serializeError(err) }, '[doctorSupport] relay error');
        });
      }

      return { ok: true };
    },

    markUserMessagesRead(conversationId: string, organizationId?: string): Promise<void> {
      return port.markUserMessagesReadByAdmin(conversationId, organizationId);
    },

    unreadFromUsers(params: {
      organizationId?: string;
      visibilityActor: PatientVisibilityActor;
    }): Promise<number> {
      return port.countUnreadUserMessagesForAdmin(params);
    },

    unreadFromPatient(platformUserId: string, organizationId?: string): Promise<number> {
      return port.countUnreadUserMessagesForAdminByPatient(platformUserId, organizationId);
    },
  };
}
