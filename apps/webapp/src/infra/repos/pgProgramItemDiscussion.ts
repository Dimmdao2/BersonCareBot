import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  programItemDiscussionMessages,
  programItemDiscussionReads,
} from "../../../db/schema/programItemDiscussion";
import { supportConversationMessages, supportConversations } from "../../../db/schema/schema";
import {
  treatmentProgramInstanceStageItems,
  treatmentProgramInstanceStages,
  treatmentProgramInstances,
} from "../../../db/schema/treatmentProgramInstances";
import { extractPatientExerciseCommentReplyBody } from "@/modules/messaging/programNoteReplyContext";
import type { ProgramItemDiscussionPort } from "@/modules/program-item-discussion/ports";
import type {
  DoctorExerciseCommentRow,
  ListDoctorExerciseCommentsInput,
  ProgramItemDiscussionLegacyMergeInput,
  ProgramItemDiscussionLegacyUnreadInput,
  ProgramItemDiscussionListPageInput,
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

function mapMessageFields(row: {
  id: string;
  instanceStageItemId: string;
  patientUserId: string;
  senderRole: string;
  origin: string;
  body: string | null;
  mediaFileId: string | null;
  supportMessageId: string | null;
  createdAt: string;
}): ProgramItemDiscussionMessage {
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

function stageItemSnapshotTitle(snapshot: Record<string, unknown>): string {
  const raw = snapshot.title;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "Упражнение";
}

async function queryDoctorExerciseComments(
  input: ListDoctorExerciseCommentsInput,
  opts: { unreadOnly: boolean },
): Promise<DoctorExerciseCommentRow[]> {
  const { patientUserIds, viewerUserId, limit, cursor } = input;
  if (patientUserIds.length === 0) return [];
  const safeLimit = Math.max(1, Math.trunc(limit));
  const db = getDrizzle();

  // CTE: latest patient text-message per exercise stage-item (DISTINCT ON = one row per item)
  const latestCte = db.$with("latest").as(
    db
      .selectDistinctOn([programItemDiscussionMessages.instanceStageItemId], {
        id: programItemDiscussionMessages.id,
        instanceStageItemId: programItemDiscussionMessages.instanceStageItemId,
        patientUserId: programItemDiscussionMessages.patientUserId,
        senderRole: programItemDiscussionMessages.senderRole,
        origin: programItemDiscussionMessages.origin,
        body: programItemDiscussionMessages.body,
        mediaFileId: programItemDiscussionMessages.mediaFileId,
        supportMessageId: programItemDiscussionMessages.supportMessageId,
        createdAt: programItemDiscussionMessages.createdAt,
        snapshot: treatmentProgramInstanceStageItems.snapshot,
        // ВАЖНО: явный алиас instance_id — иначе колонка тоже зовётся "id" и
        // CTE получает дубликат столбца "id" (вместе с messages.id) → Postgres падает
        // ("Failed query … select "id", …, "id", …"). См. TODO#3 fix.
        instanceId: sql<string>`${treatmentProgramInstances.id}`.as("instance_id"),
        lastReadAt: programItemDiscussionReads.lastReadAt,
      })
      .from(programItemDiscussionMessages)
      .innerJoin(
        treatmentProgramInstanceStageItems,
        eq(
          treatmentProgramInstanceStageItems.id,
          programItemDiscussionMessages.instanceStageItemId,
        ),
      )
      .innerJoin(
        treatmentProgramInstanceStages,
        eq(
          treatmentProgramInstanceStages.id,
          treatmentProgramInstanceStageItems.stageId,
        ),
      )
      .innerJoin(
        treatmentProgramInstances,
        eq(treatmentProgramInstances.id, treatmentProgramInstanceStages.instanceId),
      )
      .leftJoin(
        programItemDiscussionReads,
        and(
          eq(
            programItemDiscussionReads.instanceStageItemId,
            programItemDiscussionMessages.instanceStageItemId,
          ),
          eq(programItemDiscussionReads.patientUserId, viewerUserId),
        ),
      )
      .where(
        and(
          inArray(treatmentProgramInstances.patientUserId, patientUserIds),
          eq(treatmentProgramInstances.status, "active"),
          sql`${treatmentProgramInstances.assignmentSource} = ANY(ARRAY['doctor','course']::text[])`,
          eq(treatmentProgramInstanceStageItems.itemType, "exercise"),
          eq(treatmentProgramInstanceStageItems.status, "active"),
        ),
      )
      .orderBy(
        asc(programItemDiscussionMessages.instanceStageItemId),
        desc(programItemDiscussionMessages.createdAt),
        desc(programItemDiscussionMessages.id),
      ),
  );

  // outer: keep only items where latest message is a patient text; apply unread + cursor filters
  const outerConditions: ReturnType<typeof sql>[] = [
    sql`${latestCte.senderRole} = 'patient'`,
    sql`${latestCte.mediaFileId} IS NULL`,
  ];
  if (opts.unreadOnly) {
    outerConditions.push(
      sql`${latestCte.createdAt} > COALESCE(${latestCte.lastReadAt}, '-infinity'::timestamptz)`,
    );
  }
  if (cursor) {
    outerConditions.push(
      sql`(${latestCte.createdAt}, ${latestCte.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`,
    );
  }

  const rows = await db
    .with(latestCte)
    .select()
    .from(latestCte)
    .where(and(...outerConditions))
    .orderBy(desc(latestCte.createdAt), desc(latestCte.id))
    .limit(safeLimit);

  return rows.map((row) => ({
    patientUserId: row.patientUserId,
    instanceId: row.instanceId,
    stageItemId: row.instanceStageItemId,
    stageItemTitle: stageItemSnapshotTitle(row.snapshot as Record<string, unknown>),
    latestMessage: mapMessageFields(row),
    createdAt: row.createdAt,
  }));
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

    async listAttentionSummaryForStageItems(stageItemIds: string[]) {
      const ids = [...new Set(stageItemIds)];
      if (ids.length === 0) return [];
      const db = getDrizzle();
      const rows = await db
        .select()
        .from(programItemDiscussionMessages)
        .where(inArray(programItemDiscussionMessages.instanceStageItemId, ids))
        .orderBy(
          asc(programItemDiscussionMessages.instanceStageItemId),
          asc(programItemDiscussionMessages.createdAt),
          asc(programItemDiscussionMessages.id),
        );

      const latestByItem = new Map<string, ProgramItemDiscussionMessage>();
      for (const row of rows) {
        const message = mapMessage(row);
        latestByItem.set(message.instanceStageItemId, message);
      }

      return ids.map((stageItemId) => {
        const latest = latestByItem.get(stageItemId);
        if (!latest || latest.senderRole !== "patient") {
          return { stageItemId, comments: 0, media: 0 };
        }
        return {
          stageItemId,
          comments: latest.mediaFileId ? 0 : 1,
          media: latest.mediaFileId ? 1 : 0,
        };
      });
    },

    async listMessagesPage(input: ProgramItemDiscussionListPageInput): Promise<ProgramItemDiscussionMessage[]> {
      const db = getDrizzle();
      const safeLimit = Math.max(1, Math.trunc(input.limit));
      const stageItemId = input.stageItemId;
      const cursor = input.cursor;

      if (input.direction === "forward") {
        const conditions = [eq(programItemDiscussionMessages.instanceStageItemId, stageItemId)];
        if (cursor) {
          conditions.push(
            sql`(${programItemDiscussionMessages.createdAt}, ${programItemDiscussionMessages.id}) > (${cursor.createdAt}::timestamptz, ${cursor.id})`,
          );
        }
        const rows = await db
          .select()
          .from(programItemDiscussionMessages)
          .where(and(...conditions))
          .orderBy(asc(programItemDiscussionMessages.createdAt), asc(programItemDiscussionMessages.id))
          .limit(safeLimit);
        return rows.map(mapMessage);
      }

      const conditions = [eq(programItemDiscussionMessages.instanceStageItemId, stageItemId)];
      if (cursor) {
        conditions.push(
          sql`(${programItemDiscussionMessages.createdAt}, ${programItemDiscussionMessages.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id})`,
        );
      }
      const rows = await db
        .select()
        .from(programItemDiscussionMessages)
        .where(and(...conditions))
        .orderBy(desc(programItemDiscussionMessages.createdAt), desc(programItemDiscussionMessages.id))
        .limit(safeLimit);
      return rows.map(mapMessage).reverse();
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

    async countLegacyAdminRepliesForStageItem(input: ProgramItemDiscussionLegacyMergeInput): Promise<number> {
      const exerciseTitle = input.exerciseTitle.trim();
      if (!exerciseTitle) return 0;

      if (input.requireUniqueStageItemAttribution) {
        const matches = await this.listStageItemIdsByExerciseTitleForPatient(
          input.patientUserId,
          exerciseTitle,
        );
        if (matches.length !== 1 || matches[0] !== input.stageItemId) {
          return 0;
        }
      }

      const db = getDrizzle();
      const seenSupportMessageIds = new Set(input.excludeSupportMessageIds ?? []);
      const fetchChunk = 500;
      let rawOffset = 0;
      let count = 0;
      while (true) {
        const rows = await db
          .select({
            id: supportConversationMessages.id,
            text: supportConversationMessages.text,
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
            exerciseTitle,
            messageText: row.text,
          });
          if (!body) continue;
          seenSupportMessageIds.add(row.id);
          count += 1;
        }
        if (rows.length < fetchChunk) break;
      }
      return count;
    },

    async mergeLegacyAdminReplies(input: ProgramItemDiscussionLegacyMergeInput): Promise<ProgramItemDiscussionMessage[]> {
      const db = getDrizzle();
      const targetLimit = Math.max(1, Math.trunc(input.limit ?? 200));
      const safeOffset = Math.max(0, Math.trunc(input.offset ?? 0));
      const fetchChunk = Math.max(200, targetLimit * 2);
      const seenSupportMessageIds = new Set(input.excludeSupportMessageIds ?? []);
      const exerciseTitle = input.exerciseTitle.trim();
      if (!exerciseTitle) return [];

      if (input.requireUniqueStageItemAttribution) {
        const matches = await this.listStageItemIdsByExerciseTitleForPatient(
          input.patientUserId,
          exerciseTitle,
        );
        if (matches.length !== 1 || matches[0] !== input.stageItemId) {
          return [];
        }
      }

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
            exerciseTitle,
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

    async getLastReadAt(params: { patientUserId: string; stageItemId: string }): Promise<string | null> {
      const db = getDrizzle();
      const [row] = await db
        .select({ lastReadAt: programItemDiscussionReads.lastReadAt })
        .from(programItemDiscussionReads)
        .where(
          and(
            eq(programItemDiscussionReads.patientUserId, params.patientUserId),
            eq(programItemDiscussionReads.instanceStageItemId, params.stageItemId),
          ),
        )
        .limit(1);
      return row?.lastReadAt ?? null;
    },

    async getMaxLastReadAtForViewers(params: {
      stageItemId: string;
      viewerUserIds: string[];
    }): Promise<string | null> {
      if (params.viewerUserIds.length === 0) return null;
      const db = getDrizzle();
      const [row] = await db
        .select({
          maxLastReadAt: sql<string | null>`max(${programItemDiscussionReads.lastReadAt})`,
        })
        .from(programItemDiscussionReads)
        .where(
          and(
            eq(programItemDiscussionReads.instanceStageItemId, params.stageItemId),
            inArray(programItemDiscussionReads.patientUserId, params.viewerUserIds),
          ),
        );
      return row?.maxLastReadAt ?? null;
    },

    async listLinkedSupportMessageIdsForStageItem(stageItemId: string): Promise<string[]> {
      const db = getDrizzle();
      const rows = await db
        .select({ supportMessageId: programItemDiscussionMessages.supportMessageId })
        .from(programItemDiscussionMessages)
        .where(
          and(
            eq(programItemDiscussionMessages.instanceStageItemId, stageItemId),
            sql`${programItemDiscussionMessages.supportMessageId} IS NOT NULL`,
          ),
        );
      return rows
        .map((row) => row.supportMessageId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
    },

    async countLegacyUnreadAdminReplies(input: ProgramItemDiscussionLegacyUnreadInput): Promise<number> {
      const db = getDrizzle();
      const exerciseTitle = input.exerciseTitle.trim();
      if (!exerciseTitle) return 0;
      const seenSupportMessageIds = new Set(input.excludeSupportMessageIds ?? []);
      const lastReadAt = input.lastReadAt;
      const fetchChunk = 500;
      let rawOffset = 0;
      let unread = 0;
      while (true) {
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
            exerciseTitle,
            messageText: row.text,
          });
          if (!body) continue;
          seenSupportMessageIds.add(row.id);
          if (lastReadAt != null && row.createdAt <= lastReadAt) continue;
          unread += 1;
        }
        if (rows.length < fetchChunk) break;
      }
      return unread;
    },

    async findStageItemIdBySupportMessageId(supportMessageId: string): Promise<string | null> {
      const db = getDrizzle();
      const [row] = await db
        .select({ instanceStageItemId: programItemDiscussionMessages.instanceStageItemId })
        .from(programItemDiscussionMessages)
        .where(eq(programItemDiscussionMessages.supportMessageId, supportMessageId))
        .limit(1);
      return row?.instanceStageItemId ?? null;
    },

    async getMessageById(messageId: string): Promise<ProgramItemDiscussionMessage | null> {
      const db = getDrizzle();
      const [row] = await db
        .select()
        .from(programItemDiscussionMessages)
        .where(eq(programItemDiscussionMessages.id, messageId))
        .limit(1);
      return row ? mapMessage(row) : null;
    },

    async deleteMessageById(messageId: string): Promise<boolean> {
      const db = getDrizzle();
      const rows = await db
        .delete(programItemDiscussionMessages)
        .where(eq(programItemDiscussionMessages.id, messageId))
        .returning({ id: programItemDiscussionMessages.id });
      return rows.length > 0;
    },

    async listUnreadExerciseCommentsForDoctor(
      input: ListDoctorExerciseCommentsInput,
    ): Promise<DoctorExerciseCommentRow[]> {
      return queryDoctorExerciseComments(input, { unreadOnly: true });
    },

    async listExerciseCommentsForDoctor(
      input: ListDoctorExerciseCommentsInput,
    ): Promise<DoctorExerciseCommentRow[]> {
      return queryDoctorExerciseComments(input, { unreadOnly: false });
    },

    async listStageItemIdsByExerciseTitleForPatient(
      patientUserId: string,
      exerciseTitle: string,
    ): Promise<string[]> {
      const title = exerciseTitle.trim();
      if (!title) return [];
      const db = getDrizzle();
      const rows = await db
        .select({ id: treatmentProgramInstanceStageItems.id })
        .from(treatmentProgramInstanceStageItems)
        .innerJoin(
          treatmentProgramInstanceStages,
          eq(treatmentProgramInstanceStageItems.stageId, treatmentProgramInstanceStages.id),
        )
        .innerJoin(
          treatmentProgramInstances,
          eq(treatmentProgramInstanceStages.instanceId, treatmentProgramInstances.id),
        )
        .where(
          and(
            eq(treatmentProgramInstances.patientUserId, patientUserId),
            eq(treatmentProgramInstances.assignmentSource, "doctor"),
            sql`trim(${treatmentProgramInstanceStageItems.snapshot}->>'title') = ${title}`,
          ),
        );
      return rows.map((row) => row.id);
    },
  };
}
