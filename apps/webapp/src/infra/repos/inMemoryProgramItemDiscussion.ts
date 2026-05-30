import type { ProgramItemDiscussionPort } from "@/modules/program-item-discussion/ports";
import type {
  ProgramItemDiscussionLegacyMergeInput,
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

    async listMessagesForStageItem(stageItemId: string, limit = 200): Promise<ProgramItemDiscussionMessage[]> {
      const safeLimit = Math.min(Math.max(limit, 1), 500);
      return [...rows.values()]
        .filter((x) => x.instanceStageItemId === stageItemId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id)))
        .slice(0, safeLimit)
        .map((x) => ({ ...x }));
    },

    async countMessagesForItem(stageItemId: string): Promise<number> {
      return [...rows.values()].filter((x) => x.instanceStageItemId === stageItemId).length;
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
  };
}
