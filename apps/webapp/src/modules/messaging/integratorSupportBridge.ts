import type { IntegratorSupportOwnershipPort } from '@/modules/messaging/ports';
import {
  parseWebappConversationId,
  webappOrganizationConversationId,
  webappPlatformConversationId,
} from '@/modules/messaging/supportConversationIds';
import type { NotifyPatientDoctorReplyParams } from '@/modules/messaging/notifyPatientDoctorReply';
import { NOTIFICATION_TOPIC_SUPPORT_MESSAGES } from '@/modules/patient-notifications/notificationTopicCodes';
import type { SendProgramNoteReply } from '@/modules/messaging/sendProgramNoteReply';
import { logger, serializeError } from '@/infra/logging/logger';

export type IntegratorSupportSyncMessageInput = {
  platformUserId: string;
  integratorMessageId: string;
  text: string;
  source: string;
  createdAt: string;
  externalChatId?: string | null;
  externalMessageId?: string | null;
};

export type IntegratorSupportAdminReplyInput = {
  integratorConversationId: string;
  integratorMessageId: string;
  text: string;
  createdAt: string;
  senderDisplayName?: string;
  programNoteStageItemId?: string;
};

export type IntegratorSupportStatusInput = {
  integratorConversationId: string;
  status: 'open' | 'closed';
  lastMessageAt?: string | null;
  closedAt?: string | null;
  closeReason?: string | null;
};

export type IntegratorSupportCanonicalWrite = {
  conversationId: string;
  organizationId: string;
};

export function createIntegratorSupportBridge(deps: {
  port: IntegratorSupportOwnershipPort;
  resolvePatientOrganization: (
    platformUserId: string,
    verifiedOrganizationId?: string,
  ) => Promise<{ ok: true; organizationId: string } | { ok: false; error: string }>;
  withOrganizationPrincipal: <T>(organizationId: string, fn: () => Promise<T>) => Promise<T>;
  notifyPatientOfDoctorReply?: (params: NotifyPatientDoctorReplyParams) => Promise<void>;
  sendProgramNoteReply?: SendProgramNoteReply;
  notifyDoctorOfPatientMessage?: (input: {
    organizationId: string;
    platformUserId: string;
    conversationId: string;
    messageId: string;
    messageText: string;
    patientLabel: string;
    source: 'webapp' | 'telegram' | 'max';
  }) => Promise<void>;
  resolvePatientLabel?: (platformUserId: string) => Promise<string>;
}) {
  return {
    async syncUserMessage(
      input: IntegratorSupportSyncMessageInput,
    ): Promise<
      | { ok: true; canonicalWrite: IntegratorSupportCanonicalWrite }
      | { ok: false; error: string }
    > {
      const trimmed = input.text.trim();
      if (!trimmed) return { ok: false, error: 'empty' };
      const platformUserId = input.platformUserId.trim();
      if (!platformUserId) return { ok: false, error: 'missing_platform_user' };

      const organization = await deps.resolvePatientOrganization(platformUserId);
      if (!organization.ok) return organization;
      const { organizationId } = organization;
      const { conversationId, messageCreated } = await deps.withOrganizationPrincipal(
        organizationId,
        async () => {
          const { id } = await deps.port.ensureWebappConversationForUser(platformUserId);
          const appended = await deps.port.appendWebappMessage({
            conversationId: id,
            integratorMessageId: input.integratorMessageId,
            senderRole: 'user',
            text: trimmed,
            source: input.source,
            createdAt: input.createdAt,
            organizationId,
            externalChatId: input.externalChatId,
            externalMessageId: input.externalMessageId,
          });
          return { conversationId: id, messageCreated: appended.created };
        },
      );

      if (messageCreated && deps.notifyDoctorOfPatientMessage) {
        const source: 'webapp' | 'telegram' | 'max' =
          input.source === 'max' ? 'max' : input.source === 'telegram' ? 'telegram' : 'webapp';
        const patientLabel = deps.resolvePatientLabel
          ? await deps.resolvePatientLabel(platformUserId).catch(() => '')
          : '';
        deps
          .notifyDoctorOfPatientMessage({
            organizationId,
            platformUserId,
            conversationId,
            messageId: input.integratorMessageId,
            messageText: trimmed,
            patientLabel: patientLabel.trim(),
            source,
          })
          .catch((err: unknown) => {
            logger.error(
              { err: serializeError(err) },
              '[integratorSupportBridge] doctor notify error',
            );
          });
      }

      return {
        ok: true,
        canonicalWrite: {
          conversationId: webappPlatformConversationId(platformUserId),
          organizationId,
        },
      };
    },

    async applyAdminReply(
      input: IntegratorSupportAdminReplyInput,
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      const parsedConversation = parseWebappConversationId(input.integratorConversationId);
      if (!parsedConversation) return { ok: false, error: 'not_webapp_conversation' };
      const { platformUserId } = parsedConversation;

      const trimmed = input.text.trim();
      if (!trimmed) return { ok: false, error: 'empty' };

      if (input.programNoteStageItemId && deps.sendProgramNoteReply) {
        const result = await deps.sendProgramNoteReply({
          integratorConversationId: input.integratorConversationId,
          integratorMessageId: input.integratorMessageId,
          stageItemId: input.programNoteStageItemId,
          text: trimmed,
          senderDisplayName: input.senderDisplayName,
          createdAt: input.createdAt,
          source: 'webapp',
        });
        if (!result.ok) return result;
        return { ok: true };
      }

      const organization = await deps.resolvePatientOrganization(
        platformUserId,
        parsedConversation.scope === 'organization' ? parsedConversation.organizationId : undefined,
      );
      if (!organization.ok) return organization;
      const { organizationId } = organization;
      const integratorMessageId =
        input.integratorMessageId.trim() || `webapp-msg:${crypto.randomUUID()}`;
      const createdAt = input.createdAt || new Date().toISOString();

      await deps.withOrganizationPrincipal(organizationId, async () => {
        const { id: conversationId } =
          await deps.port.ensureWebappConversationForUser(platformUserId);
        await deps.port.appendWebappMessage({
          conversationId,
          integratorMessageId,
          senderRole: 'admin',
          text: trimmed,
          source: 'webapp',
          createdAt,
          organizationId,
        });
      });

      if (organizationId && deps.notifyPatientOfDoctorReply) {
        await deps.notifyPatientOfDoctorReply({
          organizationId,
          platformUserId,
          messageId: integratorMessageId,
          text: trimmed,
          senderDisplayName: input.senderDisplayName,
          topicCode: NOTIFICATION_TOPIC_SUPPORT_MESSAGES,
        });
      }

      return { ok: true };
    },

    async setStatus(
      input: IntegratorSupportStatusInput,
    ): Promise<
      | { ok: true; canonicalWrite: IntegratorSupportCanonicalWrite }
      | { ok: false; error: string }
    > {
      const parsedConversation = parseWebappConversationId(input.integratorConversationId);
      if (!parsedConversation) return { ok: false, error: 'not_webapp_conversation' };
      const organization = await deps.resolvePatientOrganization(
        parsedConversation.platformUserId,
        parsedConversation.scope === 'organization' ? parsedConversation.organizationId : undefined,
      );
      if (!organization.ok) return organization;
      await deps.withOrganizationPrincipal(organization.organizationId, () =>
        deps.port.setConversationStatusFromProjection({
          integratorConversationId: webappOrganizationConversationId(
            organization.organizationId,
            parsedConversation.platformUserId,
          ),
          status: input.status,
          lastMessageAt: input.lastMessageAt,
          closedAt: input.closedAt,
          closeReason: input.closeReason,
        }),
      );
      return {
        ok: true,
        canonicalWrite: {
          conversationId: webappPlatformConversationId(parsedConversation.platformUserId),
          organizationId: organization.organizationId,
        },
      };
    },
  };
}
