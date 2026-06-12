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

/** Cursor-ключ для keyset-пагинации doctor-wide запросов. */
export type DoctorExerciseCommentCursor = {
  createdAt: string;
  id: string;
};

/** Входные данные для doctor-wide запросов непрочитанных / истории комментариев. */
export type ListDoctorExerciseCommentsInput = {
  /** Список patient_user_id пациентов на сопровождении (резолвит загрузчик, не порт). */
  patientUserIds: string[];
  /** User id врача-viewer'а для чтения lastReadAt из _reads. */
  viewerUserId: string;
  limit: number;
  cursor?: DoctorExerciseCommentCursor | null;
};

/**
 * Счётчик «всего / непрочитанных врачом» сообщений-от-пациента по одному stageItem.
 * Используется в state B drill-down комментариев (список упражнений пациента).
 *
 * Семантика:
 * - `total`  = все сообщения пациента по данному stageItem (текст + медиа).
 * - `unread` = из них — те, чьё `createdAt` > lastReadAt для viewerUserId (или все, если lastReadAt == null).
 * - `latestMessageAt` = ISO-дата последнего сообщения пациента (для сортировки).
 */
export type StageItemViewerUnreadCount = {
  stageItemId: string;
  total: number;
  unread: number;
  latestMessageAt: string | null;
};

/**
 * Одна строка результата doctor-wide запроса: последнее сообщение пациента по exercise-элементу.
 * `instanceId` и `stageItemTitle` пусты в inMemory-реализации (нет доступа к схеме программы).
 */
export type DoctorExerciseCommentRow = {
  patientUserId: string;
  instanceId: string;
  stageItemId: string;
  stageItemTitle: string;
  latestMessage: ProgramItemDiscussionMessage;
  createdAt: string;
};
