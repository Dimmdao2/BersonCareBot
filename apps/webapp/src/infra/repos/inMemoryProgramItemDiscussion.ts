import type { ProgramItemDiscussionPort } from "@/modules/program-item-discussion/ports";
import type {
  ProgramItemDiscussionLegacyMergeInput,
  ProgramItemDiscussionLegacyUnreadInput,
  ProgramItemDiscussionListPageInput,
  ProgramItemDiscussionMessage,
  ProgramItemDiscussionMessageInsert,
} from "@/modules/program-item-discussion/types";

function isoNow(): string {
  return new Date().toISOString();
}

export function createInMemoryProgramItemDiscussionPort(): ProgramItemDiscussionPort {
  const rows = new Map<string, ProgramItemDiscussionMessage>();
  const bySupportMessageId = new Map<string, string>();
  const reads = new Map<string, string>();

  function readKey(patientUserId: string, stageItemId: string): string {
    return `${patientUserId}:${stageItemId}`;
  }

  return {
    async insertMessage(input: ProgramItemDiscussionMessageInsert): Promise<ProgramItemDiscussionMessage> {
      if (input.supportMessageId) {
        const existingId = bySupportMessageId.get(input.supportMessageId);
        if (existingId) {
          const existing = rows.get(existingId);
          if (existing) return { ...existing };
        }
      }

      const row: ProgramItemDiscussionMessage = {
        id: crypto.randomUUID(),
        instanceStageItemId: input.instanceStageItemId,
        patientUserId: input.patientUserId,
        senderRole: input.senderRole,
        origin: input.origin,
        body: input.body ?? null,
        mediaFileId: input.mediaFileId ?? null,
        supportMessageId: input.supportMessageId ?? null,
        createdAt: input.createdAt ?? isoNow(),
      };
      rows.set(row.id, row);
      if (row.supportMessageId) bySupportMessageId.set(row.supportMessageId, row.id);
      return { ...row };
    },

    async listMessagesForStageItem(
      stageItemId: string,
      limit = 200,
      offset = 0,
    ): Promise<ProgramItemDiscussionMessage[]> {
      const safeLimit = Math.max(1, Math.trunc(limit));
      const safeOffset = Math.max(0, Math.trunc(offset));
      return [...rows.values()]
        .filter((x) => x.instanceStageItemId === stageItemId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id)))
        .slice(safeOffset, safeOffset + safeLimit)
        .map((x) => ({ ...x }));
    },

    async listAttentionSummaryForStageItems(stageItemIds: string[]) {
      const ids = [...new Set(stageItemIds)];
      const sorted = [...rows.values()]
        .filter((x) => ids.includes(x.instanceStageItemId))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id)));
      const latestByItem = new Map<string, ProgramItemDiscussionMessage>();
      for (const row of sorted) {
        latestByItem.set(row.instanceStageItemId, row);
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

    async countMessagesForItem(stageItemId: string): Promise<number> {
      return [...rows.values()].filter((x) => x.instanceStageItemId === stageItemId).length;
    },

    async listMessagesPage(input: ProgramItemDiscussionListPageInput): Promise<ProgramItemDiscussionMessage[]> {
      const sorted = [...rows.values()]
        .filter((x) => x.instanceStageItemId === input.stageItemId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id)));

      if (input.direction === "forward") {
        let start = 0;
        if (input.cursor) {
          while (
            start < sorted.length &&
            (sorted[start]!.createdAt < input.cursor.createdAt ||
              (sorted[start]!.createdAt === input.cursor.createdAt && sorted[start]!.id <= input.cursor.id))
          ) {
            start += 1;
          }
        }
        return sorted.slice(start, start + input.limit).map((x) => ({ ...x }));
      }

      let endExclusive = sorted.length;
      if (input.cursor) {
        endExclusive = 0;
        while (
          endExclusive < sorted.length &&
          (sorted[endExclusive]!.createdAt < input.cursor.createdAt ||
            (sorted[endExclusive]!.createdAt === input.cursor.createdAt &&
              sorted[endExclusive]!.id < input.cursor.id))
        ) {
          endExclusive += 1;
        }
      }
      const start = Math.max(0, endExclusive - input.limit);
      return sorted.slice(start, endExclusive).map((x) => ({ ...x }));
    },

    async countLegacyAdminRepliesForStageItem(_input: ProgramItemDiscussionLegacyMergeInput): Promise<number> {
      return 0;
    },

    async mergeLegacyAdminReplies(_input: ProgramItemDiscussionLegacyMergeInput): Promise<ProgramItemDiscussionMessage[]> {
      return [];
    },

    async markRead(params: { patientUserId: string; stageItemId: string; lastReadAt?: string }): Promise<void> {
      const key = readKey(params.patientUserId, params.stageItemId);
      const current = reads.get(key);
      const next = params.lastReadAt ?? isoNow();
      if (!current || next > current) reads.set(key, next);
    },

    async getUnreadCount(params: { patientUserId: string; stageItemId: string }): Promise<number> {
      const key = readKey(params.patientUserId, params.stageItemId);
      const lastReadAt = reads.get(key) ?? "";
      return [...rows.values()].filter(
        (x) =>
          x.instanceStageItemId === params.stageItemId &&
          x.senderRole === "admin" &&
          (lastReadAt === "" || x.createdAt > lastReadAt),
      ).length;
    },

    async getLastReadAt(params: { patientUserId: string; stageItemId: string }): Promise<string | null> {
      return reads.get(readKey(params.patientUserId, params.stageItemId)) ?? null;
    },

    async getMaxLastReadAtForViewers(params: {
      stageItemId: string;
      viewerUserIds: string[];
    }): Promise<string | null> {
      if (params.viewerUserIds.length === 0) return null;
      let max: string | null = null;
      for (const viewerUserId of params.viewerUserIds) {
        const value = reads.get(readKey(viewerUserId, params.stageItemId)) ?? null;
        if (!value) continue;
        if (!max || value > max) max = value;
      }
      return max;
    },

    async listLinkedSupportMessageIdsForStageItem(stageItemId: string): Promise<string[]> {
      return [...rows.values()]
        .filter((x) => x.instanceStageItemId === stageItemId && x.supportMessageId)
        .map((x) => x.supportMessageId!)
        .filter((id) => id.length > 0);
    },

    async countLegacyUnreadAdminReplies(_input: ProgramItemDiscussionLegacyUnreadInput): Promise<number> {
      return 0;
    },

    async findStageItemIdBySupportMessageId(supportMessageId: string): Promise<string | null> {
      const existingId = bySupportMessageId.get(supportMessageId);
      if (!existingId) return null;
      return rows.get(existingId)?.instanceStageItemId ?? null;
    },

    async listStageItemIdsByExerciseTitleForPatient(_patientUserId: string, _exerciseTitle: string): Promise<string[]> {
      return [];
    },

    async getMessageById(messageId: string): Promise<ProgramItemDiscussionMessage | null> {
      const row = rows.get(messageId);
      return row ? { ...row } : null;
    },

    async deleteMessageById(messageId: string): Promise<boolean> {
      const row = rows.get(messageId);
      if (!row) return false;
      rows.delete(messageId);
      if (row.supportMessageId) bySupportMessageId.delete(row.supportMessageId);
      return true;
    },
  };
}
