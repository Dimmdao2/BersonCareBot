import type { SupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";
import {
  parsePlatformUserIdFromWebappConversationId,
  webappPlatformConversationId,
} from "@/modules/messaging/supportConversationIds";
import type { NotifyPatientDoctorReplyParams } from "@/modules/messaging/notifyPatientDoctorReply";
import type { SendProgramNoteReply } from "@/modules/messaging/sendProgramNoteReply";

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

      await deps.port.ensureWebappConversationForUser(platformUserId);
      await deps.port.mergeLegacySupportConversationsForPlatformUser?.(platformUserId).catch((err: unknown) => {
        console.error("[integratorSupportBridge] merge legacy conversations error:", err);
      });
      const integratorConversationId = webappPlatformConversationId(platformUserId);
      const conv = await deps.port.getConversationByIntegratorId(integratorConversationId);
      if (!conv) return { ok: false, error: "conversation_missing" };

      const internalId = conv.conversationId;
      if (!internalId) return { ok: false, error: "conversation_missing" };

      await deps.port.appendWebappMessage({
        conversationId: internalId,
        integratorMessageId: input.integratorMessageId,
        senderRole: "user",
        text: trimmed,
        source: input.source,
        createdAt: input.createdAt,
      });

      if (deps.notifyDoctorOfPatientMessage) {
        const source: "webapp" | "telegram" | "max" =
          input.source === "max" ? "max" : input.source === "telegram" ? "telegram" : "webapp";
        const patientLabel =
          deps.resolvePatientLabel ?
            (await deps.resolvePatientLabel(platformUserId).catch(() => "Пациент"))
          : "Пациент";
        deps
          .notifyDoctorOfPatientMessage({
            platformUserId,
            messageId: input.integratorMessageId,
            messageText: trimmed,
            patientLabel: patientLabel.trim() || "Пациент",
            source,
          })
          .catch((err: unknown) => {
            console.error("[integratorSupportBridge] doctor notify error:", err);
          });
      }

      return { ok: true };
    },

    async applyAdminReply(
      input: IntegratorSupportAdminReplyInput,
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      const platformUserId = parsePlatformUserIdFromWebappConversationId(input.integratorConversationId);
      if (!platformUserId) return { ok: false, error: "not_webapp_conversation" };

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

      const { id: conversationId } = await deps.port.ensureWebappConversationForUser(platformUserId);
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

      if (deps.notifyPatientOfDoctorReply) {
        await deps.notifyPatientOfDoctorReply({
          platformUserId,
          messageId: integratorMessageId,
          text: trimmed,
        });
      }

      return { ok: true };
    },
  };
}
