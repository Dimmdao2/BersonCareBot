import type { SupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";
import {
  parseWebappConversationId,
} from "@/modules/messaging/supportConversationIds";
import type { NotifyPatientDoctorReplyParams } from "@/modules/messaging/notifyPatientDoctorReply";
import { NOTIFICATION_TOPIC_SUPPORT_MESSAGES } from "@/modules/patient-notifications/notificationTopicCodes";
import type { SendProgramNoteReply } from "@/modules/messaging/sendProgramNoteReply";
import { logger, serializeError } from "@/infra/logging/logger";

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
  programNoteStageItemId?: string;
};

export function createIntegratorSupportBridge(deps: {
  port: SupportCommunicationPort;
  notifyPatientOfDoctorReply?: (params: NotifyPatientDoctorReplyParams) => Promise<void>;
  sendProgramNoteReply?: SendProgramNoteReply;
  notifyDoctorOfPatientMessage?: (input: {
    organizationId: string;
    platformUserId: string;
    messageId: string;
    messageText: string;
    patientLabel: string;
    source: "webapp" | "telegram" | "max";
  }) => Promise<void>;
  resolvePatientLabel?: (platformUserId: string) => Promise<string>;
}) {
  return {
    async syncUserMessage(input: IntegratorSupportSyncMessageInput): Promise<{ ok: true } | { ok: false; error: string }> {
      const trimmed = input.text.trim();
      if (!trimmed) return { ok: false, error: "empty" };
      const platformUserId = input.platformUserId.trim();
      if (!platformUserId) return { ok: false, error: "missing_platform_user" };

      const { id: conversationId, organizationId } = await deps.port.ensureWebappConversationForUser(platformUserId);
      await deps.port.mergeLegacySupportConversationsForPlatformUser?.(platformUserId).catch((err: unknown) => {
        logger.error({ err: serializeError(err) }, "[integratorSupportBridge] merge legacy conversations error");
      });

      await deps.port.appendWebappMessage({
        conversationId,
        integratorMessageId: input.integratorMessageId,
        senderRole: "user",
        text: trimmed,
        source: input.source,
        createdAt: input.createdAt,
      });

      if (organizationId && deps.notifyDoctorOfPatientMessage) {
        const source: "webapp" | "telegram" | "max" =
          input.source === "max" ? "max" : input.source === "telegram" ? "telegram" : "webapp";
        const patientLabel =
          deps.resolvePatientLabel ?
            (await deps.resolvePatientLabel(platformUserId).catch(() => "Пациент"))
          : "Пациент";
        deps
          .notifyDoctorOfPatientMessage({
            organizationId,
            platformUserId,
            messageId: input.integratorMessageId,
            messageText: trimmed,
            patientLabel: patientLabel.trim() || "Пациент",
            source,
          })
          .catch((err: unknown) => {
            logger.error({ err: serializeError(err) }, "[integratorSupportBridge] doctor notify error");
          });
      }

      return { ok: true };
    },

    async applyAdminReply(
      input: IntegratorSupportAdminReplyInput,
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      const parsedConversation = parseWebappConversationId(input.integratorConversationId);
      if (!parsedConversation) return { ok: false, error: "not_webapp_conversation" };
      // This bridge is called by a signed M2M route without a tenant principal. Until the
      // callback contract carries trusted organization context, resolving a scoped key by
      // patient alone could append Clinic B's reply to Clinic A's legacy conversation.
      if (parsedConversation.scope === "organization") {
        return { ok: false, error: "organization_context_required" };
      }
      const { platformUserId } = parsedConversation;

      const trimmed = input.text.trim();
      if (!trimmed) return { ok: false, error: "empty" };

      if (input.programNoteStageItemId && deps.sendProgramNoteReply) {
        const result = await deps.sendProgramNoteReply({
          integratorConversationId: input.integratorConversationId,
          integratorMessageId: input.integratorMessageId,
          stageItemId: input.programNoteStageItemId,
          text: trimmed,
          createdAt: input.createdAt,
          source: "webapp",
        });
        if (!result.ok) return result;
        return { ok: true };
      }

      const { id: conversationId, organizationId } = await deps.port.ensureWebappConversationForUser(platformUserId);
      const integratorMessageId = input.integratorMessageId.trim() || `webapp-msg:${crypto.randomUUID()}`;
      const createdAt = input.createdAt || new Date().toISOString();

      await deps.port.appendWebappMessage({
        conversationId,
        integratorMessageId,
        senderRole: "admin",
        text: trimmed,
        source: "webapp",
        createdAt,
      });

      if (organizationId && deps.notifyPatientOfDoctorReply) {
        await deps.notifyPatientOfDoctorReply({
          organizationId,
          platformUserId,
          messageId: integratorMessageId,
          text: trimmed,
          topicCode: NOTIFICATION_TOPIC_SUPPORT_MESSAGES,
        });
      }

      return { ok: true };
    },
  };
}
