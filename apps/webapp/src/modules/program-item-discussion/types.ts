export const PROGRAM_ITEM_DISCUSSION_SENDER_ROLES = ["patient", "admin"] as const;
export type ProgramItemDiscussionSenderRole = (typeof PROGRAM_ITEM_DISCUSSION_SENDER_ROLES)[number];

export const PROGRAM_ITEM_DISCUSSION_ORIGINS = ["patient_observation", "support_admin_reply"] as const;
export type ProgramItemDiscussionOrigin = (typeof PROGRAM_ITEM_DISCUSSION_ORIGINS)[number];

export type ProgramItemDiscussionMessage = {
  id: string;
  instanceStageItemId: string;
  patientUserId: string;
  senderRole: ProgramItemDiscussionSenderRole;
  origin: ProgramItemDiscussionOrigin;
  body: string | null;
  mediaFileId: string | null;
  supportMessageId: string | null;
  createdAt: string;
};

export type ProgramItemDiscussionMessageInsert = {
  instanceStageItemId: string;
  patientUserId: string;
  senderRole: ProgramItemDiscussionSenderRole;
  origin: ProgramItemDiscussionOrigin;
  body?: string | null;
  mediaFileId?: string | null;
  supportMessageId?: string | null;
  createdAt?: string;
};

export type ProgramItemDiscussionAttentionSummary = {
  stageItemId: string;
  comments: number;
  media: number;
};

export type ProgramItemDiscussionMessageCursor = {
  createdAt: string;
  id: string;
};

export type ProgramItemDiscussionListPageInput = {
  stageItemId: string;
  limit: number;
  direction: "backward" | "forward";
  cursor: ProgramItemDiscussionMessageCursor | null;
};

export type ProgramItemDiscussionLegacyMergeInput = {
  patientUserId: string;
  stageItemId: string;
  exerciseTitle: string;
  excludeSupportMessageIds?: string[];
  limit?: number;
  offset?: number;
  /** When set, legacy rows are included only if title maps to this stage item uniquely. */
  requireUniqueStageItemAttribution?: boolean;
};

export type ProgramItemDiscussionLegacyUnreadInput = {
  patientUserId: string;
  exerciseTitle: string;
  excludeSupportMessageIds?: string[];
  lastReadAt: string | null;
};
