import type { NotifyPatientDoctorReplyParams } from "@/modules/messaging/notifyPatientDoctorReply";
import {
  formatPatientExerciseCommentReplyText,
  resolveProgramNoteReplyContext,
} from "@/modules/messaging/programNoteReplyContext";
import type { PatientInboundChatPort } from "@/modules/messaging/ports";
import { parsePlatformUserIdFromWebappConversationId } from "@/modules/messaging/supportConversationIds";
import type { ProgramItemDiscussionService } from "@/modules/program-item-discussion/service";

const MAX_LEN = 4000;

export type SendProgramNoteReplyInput = {
  integratorConversationId: string;
  integratorMessageId: string;
  stageItemId: string;
  text: string;
  createdAt?: string;
  source?: string;
};

export type SendProgramNoteReplyResult =
  | { ok: true; platformUserId: string; chatText: string; supportMessageId: string }
  | {
      ok: false;
      error:
        | "empty"
        | "too_long"
        | "not_webapp_conversation"
        | "stage_item_not_found"
        | "stage_item_mismatch"
        | "program_not_doctor_assigned"
        | "program_item_not_active";
    };

export function createSendProgramNoteReply(deps: {
  supportCommunication: PatientInboundChatPort;
  discussion: ProgramItemDiscussionService;
  notifyPatientOfDoctorReply?: (params: NotifyPatientDoctorReplyParams) => Promise<void>;
}) {
  return async function sendProgramNoteReply(input: SendProgramNoteReplyInput): Promise<SendProgramNoteReplyResult> {
    const platformUserId = parsePlatformUserIdFromWebappConversationId(input.integratorConversationId);
    if (!platformUserId) return { ok: false, error: "not_webapp_conversation" };

    const stageItemId = input.stageItemId.trim();
    const text = input.text.trim();
    if (!text) return { ok: false, error: "empty" };
    if (text.length > MAX_LEN) return { ok: false, error: "too_long" };

    const ctx = await resolveProgramNoteReplyContext(stageItemId);
    if (!ctx) return { ok: false, error: "stage_item_not_found" };
    if (ctx.platformUserId !== platformUserId) return { ok: false, error: "stage_item_mismatch" };
    if (ctx.assignmentSource !== "doctor") return { ok: false, error: "program_not_doctor_assigned" };
    if (ctx.itemStatus !== "active") return { ok: false, error: "program_item_not_active" };

    const chatText = formatPatientExerciseCommentReplyText({
      exerciseTitle: ctx.exerciseTitle,
      doctorText: text,
    });
    const createdAt = input.createdAt ?? new Date().toISOString();
    const integratorMessageId = input.integratorMessageId.trim() || `webapp-msg:${crypto.randomUUID()}`;

    const { id: conversationId } = await deps.supportCommunication.ensureWebappConversationForUser(platformUserId);
    const supportMessage = await deps.supportCommunication.appendWebappMessage({
      conversationId,
      integratorMessageId,
      senderRole: "admin",
      text: chatText,
      source: input.source?.trim() || "webapp",
      createdAt,
    });

    await deps.discussion.appendDoctorReplyForProgramNote({
      instanceStageItemId: stageItemId,
      patientUserId: platformUserId,
      assignmentSource: ctx.assignmentSource,
      itemStatus: ctx.itemStatus,
      body: text,
      supportMessageId: supportMessage.id,
      createdAt,
    });

    if (deps.notifyPatientOfDoctorReply) {
      await deps.notifyPatientOfDoctorReply({
        platformUserId,
        messageId: integratorMessageId,
        text: chatText,
      });
    }

    return { ok: true, platformUserId, chatText, supportMessageId: supportMessage.id };
  };
}

export type SendProgramNoteReply = ReturnType<typeof createSendProgramNoteReply>;
