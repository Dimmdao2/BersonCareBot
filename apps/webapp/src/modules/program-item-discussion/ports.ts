import type {
  ProgramItemDiscussionLegacyMergeInput,
  ProgramItemDiscussionMessage,
  ProgramItemDiscussionMessageInsert,
} from "./types";

export type ProgramItemDiscussionPort = {
  insertMessage(input: ProgramItemDiscussionMessageInsert): Promise<ProgramItemDiscussionMessage>;
  listMessagesForStageItem(stageItemId: string, limit?: number): Promise<ProgramItemDiscussionMessage[]>;
  countMessagesForItem(stageItemId: string): Promise<number>;
  mergeLegacyAdminReplies(input: ProgramItemDiscussionLegacyMergeInput): Promise<ProgramItemDiscussionMessage[]>;
  markRead(params: { patientUserId: string; stageItemId: string; lastReadAt?: string }): Promise<void>;
  getUnreadCount(params: { patientUserId: string; stageItemId: string }): Promise<number>;
};
