import type {
  DoctorExerciseCommentRow,
  DoctorExerciseCommentCursor,
  ListDoctorExerciseCommentsInput,
  ProgramItemDiscussionLegacyMergeInput,
  ProgramItemDiscussionLegacyUnreadInput,
  ProgramItemDiscussionAttentionSummary,
  ProgramItemDiscussionListPageInput,
  ProgramItemDiscussionMessage,
  ProgramItemDiscussionMessageInsert,
  StageItemViewerUnreadCount,
} from "./types";

export type ProgramItemDiscussionPort = {
  insertMessage(input: ProgramItemDiscussionMessageInsert): Promise<ProgramItemDiscussionMessage>;
  listMessagesForStageItem(stageItemId: string, limit?: number, offset?: number): Promise<ProgramItemDiscussionMessage[]>;
  listAttentionSummaryForStageItems(stageItemIds: string[]): Promise<ProgramItemDiscussionAttentionSummary[]>;
  listMessagesPage(input: ProgramItemDiscussionListPageInput): Promise<ProgramItemDiscussionMessage[]>;
  countMessagesForItem(stageItemId: string): Promise<number>;
  countLegacyAdminRepliesForStageItem(input: ProgramItemDiscussionLegacyMergeInput): Promise<number>;
  mergeLegacyAdminReplies(input: ProgramItemDiscussionLegacyMergeInput): Promise<ProgramItemDiscussionMessage[]>;
  markRead(params: { patientUserId: string; stageItemId: string; lastReadAt?: string }): Promise<void>;
  getUnreadCount(params: { patientUserId: string; stageItemId: string }): Promise<number>;
  getLastReadAt(params: { patientUserId: string; stageItemId: string }): Promise<string | null>;
  getMaxLastReadAtForViewers(params: { stageItemId: string; viewerUserIds: string[] }): Promise<string | null>;
  countLegacyUnreadAdminReplies(input: ProgramItemDiscussionLegacyUnreadInput): Promise<number>;
  listLinkedSupportMessageIdsForStageItem(stageItemId: string): Promise<string[]>;
  findStageItemIdBySupportMessageId(supportMessageId: string): Promise<string | null>;
  listStageItemIdsByExerciseTitleForPatient(patientUserId: string, exerciseTitle: string): Promise<string[]>;
  getMessageById(messageId: string): Promise<ProgramItemDiscussionMessage | null>;
  deleteMessageById(messageId: string): Promise<boolean>;
  /**
   * Один индексированный запрос — последнее непрочитанное врачом сообщение-от-пациента
   * по каждому exercise-элементу всех пациентов из списка. Новые сверху, keyset-пагинация.
   */
  listUnreadExerciseCommentsForDoctor(input: ListDoctorExerciseCommentsInput): Promise<DoctorExerciseCommentRow[]>;
  /**
   * История: последнее сообщение-от-пациента по каждому exercise-элементу (прочитанные
   * и непрочитанные). Новые сверху, keyset-пагинация. Для ленивой подгрузки в табе.
   */
  listExerciseCommentsForDoctor(input: ListDoctorExerciseCommentsInput): Promise<DoctorExerciseCommentRow[]>;
  /**
   * Doctor-wide полная история: все треды с хотя бы одним комментарием пациента,
   * включая отвеченные (нет фильтра «последнее = от пациента»).
   * Скоуп по assigned_by врача — без фан-аута по patient_user_id.
   */
  listAllExerciseCommentsForDoctor(input: {
    viewerUserId: string;
    limit: number;
    cursor?: DoctorExerciseCommentCursor | null;
  }): Promise<DoctorExerciseCommentRow[]>;

  /**
   * Batch: «всего / непрочитанных viewer'ом» по списку stageItemIds (для state B drill-down).
   * Возвращает строку для каждого переданного id (даже если 0 сообщений — total=0, unread=0).
   * `viewerUserId` — userId врача (ключ lastReadAt совпадает с его `markReadForViewer`).
   */
  listUnreadCountsForViewerByStageItems(input: {
    stageItemIds: string[];
    viewerUserId: string;
  }): Promise<StageItemViewerUnreadCount[]>;
};
