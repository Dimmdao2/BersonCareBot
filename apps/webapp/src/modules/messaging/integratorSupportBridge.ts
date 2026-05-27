import type { SupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";
import {
  parsePlatformUserIdFromWebappConversationId,
  webappPlatformConversationId,
} from "@/modules/messaging/supportConversationIds";
import type { NotifyPatientDoctorReplyParams } from "@/modules/messaging/notifyPatientDoctorReply";
import {
  formatPatientExerciseCommentReplyText,
  resolveProgramNoteReplyContext,
} from "@/modules/messaging/programNoteReplyContext";

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
      return { ok: true };
    },

    async applyAdminReply(
      input: IntegratorSupportAdminReplyInput,
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      const platformUserId = parsePlatformUserIdFromWebappConversationId(input.integratorConversationId);
      if (!platformUserId) return { ok: false, error: "not_webapp_conversation" };

      const trimmed = input.text.trim();
      if (!trimmed) return { ok: false, error: "empty" };

      let chatText = trimmed;
      if (input.programNoteStageItemId) {
        const noteCtx = await resolveProgramNoteReplyContext(input.programNoteStageItemId);
        if (noteCtx && noteCtx.platformUserId === platformUserId) {
          chatText = formatPatientExerciseCommentReplyText({
            exerciseTitle: noteCtx.exerciseTitle,
            doctorText: trimmed,
          });
        }
      }

      const { id: conversationId } = await deps.port.ensureWebappConversationForUser(platformUserId);
      const integratorMessageId = input.integratorMessageId.trim() || `webapp-msg:${crypto.randomUUID()}`;
      const createdAt = input.createdAt || new Date().toISOString();

      await deps.port.appendWebappMessage({
        conversationId,
        integratorMessageId,
        senderRole: "admin",
        text: chatText,
        source: "webapp",
        createdAt,
      });

      if (deps.notifyPatientOfDoctorReply) {
        await deps.notifyPatientOfDoctorReply({
          platformUserId,
          messageId: integratorMessageId,
          text: chatText,
        });
      }

      return { ok: true };
    },
  };
}
