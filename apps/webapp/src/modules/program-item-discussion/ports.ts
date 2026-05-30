import type {
  ProgramItemDiscussionLegacyMergeInput,
  ProgramItemDiscussionLegacyUnreadInput,
  ProgramItemDiscussionListPageInput,
  ProgramItemDiscussionMessage,
  ProgramItemDiscussionMessageInsert,
} from "./types";

export type ProgramItemDiscussionPort = {
  insertMessage(input: ProgramItemDiscussionMessageInsert): Promise<ProgramItemDiscussionMessage>;
  listMessagesForStageItem(stageItemId: string, limit?: number, offset?: number): Promise<ProgramItemDiscussionMessage[]>;
  listMessagesPage(input: ProgramItemDiscussionListPageInput): Promise<ProgramItemDiscussionMessage[]>;
  countMessagesForItem(stageItemId: string): Promise<number>;
  countLegacyAdminRepliesForStageItem(input: ProgramItemDiscussionLegacyMergeInput): Promise<number>;
  mergeLegacyAdminReplies(input: ProgramItemDiscussionLegacyMergeInput): Promise<ProgramItemDiscussionMessage[]>;
  markRead(params: { patientUserId: string; stageItemId: string; lastReadAt?: string }): Promise<void>;
  getUnreadCount(params: { patientUserId: string; stageItemId: string }): Promise<number>;
  getLastReadAt(params: { patientUserId: string; stageItemId: string }): Promise<string | null>;
  countLegacyUnreadAdminReplies(input: ProgramItemDiscussionLegacyUnreadInput): Promise<number>;
  listLinkedSupportMessageIdsForStageItem(stageItemId: string): Promise<string[]>;
  findStageItemIdBySupportMessageId(supportMessageId: string): Promise<string | null>;
  listStageItemIdsByExerciseTitleForPatient(patientUserId: string, exerciseTitle: string): Promise<string[]>;
};
