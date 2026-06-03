import type { ProgramItemDiscussionPort } from "./ports";
import type {
  ProgramItemDiscussionLegacyMergeInput,
  ProgramItemDiscussionAttentionSummary,
  ProgramItemDiscussionListPageInput,
  ProgramItemDiscussionMessage,
  ProgramItemDiscussionMessageInsert,
} from "./types";
import {
  PROGRAM_ITEM_DISCUSSION_ORIGINS,
  PROGRAM_ITEM_DISCUSSION_SENDER_ROLES,
} from "./types";
import { syncDiscussionReadFromSupportInboundMessages } from "./syncDiscussionReadFromSupportInbound";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_LEN = 4000;

function assertUuid(raw: string, field: string): string {
  const value = raw.trim();
  if (!UUID_RE.test(value)) {
    throw new Error(`${field}_invalid`);
  }
  return value;
}

function normalizeBody(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.length > MAX_BODY_LEN) throw new Error("body_too_long");
  return value;
}

function assertSenderRole(raw: string): asserts raw is (typeof PROGRAM_ITEM_DISCUSSION_SENDER_ROLES)[number] {
  if (!PROGRAM_ITEM_DISCUSSION_SENDER_ROLES.includes(raw as (typeof PROGRAM_ITEM_DISCUSSION_SENDER_ROLES)[number])) {
    throw new Error("sender_role_invalid");
  }
}

function assertOrigin(raw: string): asserts raw is (typeof PROGRAM_ITEM_DISCUSSION_ORIGINS)[number] {
  if (!PROGRAM_ITEM_DISCUSSION_ORIGINS.includes(raw as (typeof PROGRAM_ITEM_DISCUSSION_ORIGINS)[number])) {
    throw new Error("origin_invalid");
  }
}

export function createProgramItemDiscussionService(port: ProgramItemDiscussionPort) {
  async function appendMessage(input: ProgramItemDiscussionMessageInsert): Promise<ProgramItemDiscussionMessage> {
    const instanceStageItemId = assertUuid(input.instanceStageItemId, "stage_item_id");
    const patientUserId = assertUuid(input.patientUserId, "patient_user_id");
    const senderRole = input.senderRole;
    assertSenderRole(senderRole);
    const origin = input.origin;
    assertOrigin(origin);
    const mediaFileId = input.mediaFileId ? assertUuid(input.mediaFileId, "media_file_id") : null;
    const supportMessageId = input.supportMessageId ? assertUuid(input.supportMessageId, "support_message_id") : null;
    const body = normalizeBody(input.body);
    if (!body && !mediaFileId) throw new Error("message_payload_empty");
    return port.insertMessage({
      instanceStageItemId,
      patientUserId,
      senderRole,
      origin,
      body,
      mediaFileId,
      supportMessageId,
      createdAt: input.createdAt,
    });
  }

  return {
    appendMessage,

    async appendDoctorReplyForProgramNote(input: {
      instanceStageItemId: string;
      patientUserId: string;
      assignmentSource: string;
      itemStatus: string;
      body: string;
      supportMessageId: string;
      createdAt?: string;
    }): Promise<ProgramItemDiscussionMessage> {
      if (input.assignmentSource !== "doctor") {
        throw new Error("program_not_doctor_assigned");
      }
      if (input.itemStatus !== "active") {
        throw new Error("program_item_not_active");
      }
      return appendMessage({
        instanceStageItemId: input.instanceStageItemId,
        patientUserId: input.patientUserId,
        senderRole: "admin",
        origin: "support_admin_reply",
        body: input.body,
        supportMessageId: input.supportMessageId,
        createdAt: input.createdAt,
      });
    },

    async listMessagesForStageItem(
      stageItemId: string,
      limit = 200,
      offset = 0,
    ): Promise<ProgramItemDiscussionMessage[]> {
      const safeOffset = Math.max(0, Math.trunc(offset));
      return port.listMessagesForStageItem(assertUuid(stageItemId, "stage_item_id"), limit, safeOffset);
    },

    async listAttentionSummaryForStageItems(stageItemIds: string[]): Promise<ProgramItemDiscussionAttentionSummary[]> {
      const ids = [...new Set(stageItemIds.map((id) => assertUuid(id, "stage_item_id")))];
      if (ids.length === 0) return [];
      return port.listAttentionSummaryForStageItems(ids);
    },

    async listMessagesPage(input: ProgramItemDiscussionListPageInput): Promise<ProgramItemDiscussionMessage[]> {
      return port.listMessagesPage({
        ...input,
        stageItemId: assertUuid(input.stageItemId, "stage_item_id"),
        limit: Math.max(1, Math.trunc(input.limit)),
      });
    },

    async countMessagesForItem(stageItemId: string): Promise<number> {
      return port.countMessagesForItem(assertUuid(stageItemId, "stage_item_id"));
    },

    async listLinkedSupportMessageIdsForStageItem(stageItemId: string): Promise<string[]> {
      return port.listLinkedSupportMessageIdsForStageItem(assertUuid(stageItemId, "stage_item_id"));
    },

    async countLegacyAdminRepliesForStageItem(
      input: ProgramItemDiscussionLegacyMergeInput,
    ): Promise<number> {
      const stageItemId = assertUuid(input.stageItemId, "stage_item_id");
      const patientUserId = assertUuid(input.patientUserId, "patient_user_id");
      const exerciseTitle = input.exerciseTitle.trim();
      if (!exerciseTitle) return 0;
      const excludeSupportMessageIds = (input.excludeSupportMessageIds ?? []).map((id) =>
        assertUuid(id, "support_message_id"),
      );
      return port.countLegacyAdminRepliesForStageItem({
        patientUserId,
        stageItemId,
        exerciseTitle,
        excludeSupportMessageIds,
        requireUniqueStageItemAttribution: input.requireUniqueStageItemAttribution,
      });
    },

    async mergeLegacyAdminReplies(input: ProgramItemDiscussionLegacyMergeInput): Promise<ProgramItemDiscussionMessage[]> {
      const stageItemId = assertUuid(input.stageItemId, "stage_item_id");
      const patientUserId = assertUuid(input.patientUserId, "patient_user_id");
      const exerciseTitle = input.exerciseTitle.trim();
      if (!exerciseTitle) return [];
      const excludeSupportMessageIds = (input.excludeSupportMessageIds ?? []).map((id) =>
        assertUuid(id, "support_message_id"),
      );
      return port.mergeLegacyAdminReplies({
        patientUserId,
        stageItemId,
        exerciseTitle,
        excludeSupportMessageIds,
        limit: input.limit,
        offset: input.offset,
        requireUniqueStageItemAttribution: input.requireUniqueStageItemAttribution,
      });
    },

    async markRead(input: { patientUserId: string; stageItemId: string; lastReadAt?: string }): Promise<void> {
      await port.markRead({
        patientUserId: assertUuid(input.patientUserId, "patient_user_id"),
        stageItemId: assertUuid(input.stageItemId, "stage_item_id"),
        lastReadAt: input.lastReadAt,
      });
    },

    async getUnreadCount(input: { patientUserId: string; stageItemId: string; exerciseTitle?: string }): Promise<number> {
      const patientUserId = assertUuid(input.patientUserId, "patient_user_id");
      const stageItemId = assertUuid(input.stageItemId, "stage_item_id");
      const tableUnread = await port.getUnreadCount({ patientUserId, stageItemId });
      const exerciseTitle = input.exerciseTitle?.trim();
      if (!exerciseTitle) return tableUnread;

      const [lastReadAt, excludeSupportMessageIds] = await Promise.all([
        port.getLastReadAt({ patientUserId, stageItemId }),
        port.listLinkedSupportMessageIdsForStageItem(stageItemId),
      ]);
      const legacyUnread = await port.countLegacyUnreadAdminReplies({
        patientUserId,
        exerciseTitle,
        excludeSupportMessageIds,
        lastReadAt,
      });
      return tableUnread + legacyUnread;
    },

    async syncDiscussionReadFromSupportInboundMessages(input: {
      patientUserId: string;
      inboundAdminMessages: Array<{ id: string; text: string }>;
    }): Promise<{ markedStageItemIds: string[]; skippedAmbiguous: number }> {
      return syncDiscussionReadFromSupportInboundMessages({
        port,
        patientUserId: assertUuid(input.patientUserId, "patient_user_id"),
        inboundAdminMessages: input.inboundAdminMessages,
      });
    },
  };
}

export type ProgramItemDiscussionService = ReturnType<typeof createProgramItemDiscussionService>;
