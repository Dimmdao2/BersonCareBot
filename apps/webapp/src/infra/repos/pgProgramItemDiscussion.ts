import { and, asc, eq, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  programItemDiscussionMessages,
  programItemDiscussionReads,
} from "../../../db/schema/programItemDiscussion";
import { supportConversationMessages, supportConversations } from "../../../db/schema/schema";
import { extractPatientExerciseCommentReplyBody } from "@/modules/messaging/programNoteReplyContext";
import type { ProgramItemDiscussionPort } from "@/modules/program-item-discussion/ports";
import type {
  ProgramItemDiscussionLegacyMergeInput,
  ProgramItemDiscussionMessage,
  ProgramItemDiscussionMessageInsert,
  ProgramItemDiscussionOrigin,
  ProgramItemDiscussionSenderRole,
} from "@/modules/program-item-discussion/types";

function mapMessage(row: typeof programItemDiscussionMessages.$inferSelect): ProgramItemDiscussionMessage {
  return {
    id: row.id,
    instanceStageItemId: row.instanceStageItemId,
    patientUserId: row.patientUserId,
    senderRole: row.senderRole as ProgramItemDiscussionSenderRole,
    origin: row.origin as ProgramItemDiscussionOrigin,
    body: row.body,
    mediaFileId: row.mediaFileId,
    supportMessageId: row.supportMessageId,
    createdAt: row.createdAt,
  };
}

export function createPgProgramItemDiscussionPort(): ProgramItemDiscussionPort {
  return {
    async insertMessage(input: ProgramItemDiscussionMessageInsert): Promise<ProgramItemDiscussionMessage> {
      const db = getDrizzle();
      try {
        const [row] = await db
          .insert(programItemDiscussionMessages)
          .values({
            instanceStageItemId: input.instanceStageItemId,
            patientUserId: input.patientUserId,
            senderRole: input.senderRole,
            origin: input.origin,
            body: input.body ?? null,
            mediaFileId: input.mediaFileId ?? null,
            supportMessageId: input.supportMessageId ?? null,
            createdAt: input.createdAt ?? new Date().toISOString(),
          })
          .returning();
        if (!row) throw new Error("program_item_discussion_insert_failed");
        return mapMessage(row);
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : null;
        if (code === "23505" && input.supportMessageId) {
          const [existing] = await db
            .select()
            .from(programItemDiscussionMessages)
            .where(eq(programItemDiscussionMessages.supportMessageId, input.supportMessageId))
            .limit(1);
          if (existing) return mapMessage(existing);
        }
        throw error;
      }
    },

    async listMessagesForStageItem(stageItemId: string, limit = 200, offset = 0): Promise<ProgramItemDiscussionMessage[]> {
      const db = getDrizzle();
      const safeLimit = Math.max(1, Math.trunc(limit));
      const safeOffset = Math.max(0, Math.trunc(offset));
      const rows = await db
        .select()
        .from(programItemDiscussionMessages)
        .where(eq(programItemDiscussionMessages.instanceStageItemId, stageItemId))
        .orderBy(asc(programItemDiscussionMessages.createdAt), asc(programItemDiscussionMessages.id))
        .limit(safeLimit)
        .offset(safeOffset);
      return rows.map(mapMessage);
    },

    async countMessagesForItem(stageItemId: string): Promise<number> {
      const db = getDrizzle();
      const [row] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(programItemDiscussionMessages)
        .where(eq(programItemDiscussionMessages.instanceStageItemId, stageItemId));
      return Number(row?.count ?? 0);
    },

    async mergeLegacyAdminReplies(input: ProgramItemDiscussionLegacyMergeInput): Promise<ProgramItemDiscussionMessage[]> {
      const db = getDrizzle();
      const targetLimit = Math.max(1, Math.trunc(input.limit ?? 200));
      const safeOffset = Math.max(0, Math.trunc(input.offset ?? 0));
      const fetchChunk = Math.max(200, targetLimit * 2);
      const seenSupportMessageIds = new Set(input.excludeSupportMessageIds ?? []);
      let skippedMerged = 0;
      let rawOffset = 0;
      const merged: ProgramItemDiscussionMessage[] = [];
      while (merged.length < targetLimit) {
        const rows = await db
          .select({
            id: supportConversationMessages.id,
            text: supportConversationMessages.text,
            createdAt: supportConversationMessages.createdAt,
          })
          .from(supportConversationMessages)
          .innerJoin(
            supportConversations,
            eq(supportConversationMessages.conversationId, supportConversations.id),
          )
          .where(
            and(
              eq(supportConversations.platformUserId, input.patientUserId),
              eq(supportConversationMessages.senderRole, "admin"),
            ),
          )
          .orderBy(asc(supportConversationMessages.createdAt), asc(supportConversationMessages.id))
          .limit(fetchChunk)
          .offset(rawOffset);

        if (rows.length === 0) break;
        rawOffset += rows.length;

        for (const row of rows) {
          if (seenSupportMessageIds.has(row.id)) continue;
          const body = extractPatientExerciseCommentReplyBody({
            exerciseTitle: input.exerciseTitle,
            messageText: row.text,
          });
          if (!body) continue;
          seenSupportMessageIds.add(row.id);
          if (skippedMerged < safeOffset) {
            skippedMerged += 1;
            continue;
          }
          merged.push({
            id: `legacy:${row.id}`,
            instanceStageItemId: input.stageItemId,
            patientUserId: input.patientUserId,
            senderRole: "admin",
            origin: "support_admin_reply",
            body,
            mediaFileId: null,
            supportMessageId: row.id,
            createdAt: row.createdAt,
          });
          if (merged.length >= targetLimit) break;
        }
        if (rows.length < fetchChunk) break;
      }
      return merged;
    },

    async markRead(params: { patientUserId: string; stageItemId: string; lastReadAt?: string }): Promise<void> {
      const db = getDrizzle();
      const lastReadAt = params.lastReadAt ?? new Date().toISOString();
      await db
        .insert(programItemDiscussionReads)
        .values({
          patientUserId: params.patientUserId,
          instanceStageItemId: params.stageItemId,
          lastReadAt,
        })
        .onConflictDoUpdate({
          target: [programItemDiscussionReads.patientUserId, programItemDiscussionReads.instanceStageItemId],
          set: {
            lastReadAt: sql`GREATEST(${programItemDiscussionReads.lastReadAt}, ${lastReadAt}::timestamptz)`,
          },
        });
    },

    async getUnreadCount(params: { patientUserId: string; stageItemId: string }): Promise<number> {
      const db = getDrizzle();
      const [row] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(programItemDiscussionMessages)
        .leftJoin(
          programItemDiscussionReads,
          and(
            eq(programItemDiscussionReads.patientUserId, params.patientUserId),
            eq(programItemDiscussionReads.instanceStageItemId, programItemDiscussionMessages.instanceStageItemId),
          ),
        )
        .where(
          and(
            eq(programItemDiscussionMessages.instanceStageItemId, params.stageItemId),
            eq(programItemDiscussionMessages.senderRole, "admin"),
            sql`${programItemDiscussionMessages.createdAt} > COALESCE(${programItemDiscussionReads.lastReadAt}, '-infinity'::timestamptz)`,
          ),
        );
      return Number(row?.count ?? 0);
    },
  };
}
