/** Совпадает с CHECK в `treatment_program_template_stage_items`. */
export const TREATMENT_PROGRAM_ITEM_TYPES = [
  "exercise",
  "lfk_complex",
  "recommendation",
  "lesson",
  "test_set",
] as const;

/** Основная секция каталога уроков в CMS webapp (`content_pages.section`). */
export const LESSON_CONTENT_SECTION = "lessons" as const;
/** Совместимый алиас из ранних версий SYSTEM_LOGIC_SCHEMA §4 — валидация принимает обе секции. */
export const LESSON_CONTENT_SECTION_LEGACY = "course_lessons" as const;

export type TreatmentProgramTemplateStatus = "draft" | "published" | "archived";

export type TreatmentProgramItemType = (typeof TREATMENT_PROGRAM_ITEM_TYPES)[number];

export type TreatmentProgramTemplate = {
  id: string;
  title: string;
  description: string | null;
  status: TreatmentProgramTemplateStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TreatmentProgramStage = {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  sortOrder: number;
};

export type TreatmentProgramStageItem = {
  id: string;
  stageId: string;
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  sortOrder: number;
  comment: string | null;
  settings: Record<string, unknown> | null;
};

export type TreatmentProgramTemplateDetail = TreatmentProgramTemplate & {
  stages: Array<TreatmentProgramStage & { items: TreatmentProgramStageItem[] }>;
};

export type TreatmentProgramTemplateFilter = {
  includeArchived?: boolean;
  /** Если задано — только шаблоны с этим статусом. */
  status?: TreatmentProgramTemplateStatus;
};

export type CreateTreatmentProgramTemplateInput = {
  title: string;
  description?: string | null;
  status?: TreatmentProgramTemplateStatus;
};

export type UpdateTreatmentProgramTemplateInput = {
  title?: string;
  description?: string | null;
  status?: TreatmentProgramTemplateStatus;
};

/** См. `ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md` раздел 6 (Guard архива шаблона). */
export const TREATMENT_PROGRAM_TEMPLATE_USAGE_DETAIL_LIMIT = 12;

export type TreatmentProgramTemplateUsageRef =
  | { kind: "treatment_program_instance"; id: string; title: string; patientUserId: string }
  | { kind: "course"; id: string; title: string };

export type TreatmentProgramTemplateUsageSnapshot = {
  activeTreatmentProgramInstanceCount: number;
  completedTreatmentProgramInstanceCount: number;
  publishedCourseCount: number;
  draftCourseCount: number;
  archivedCourseCount: number;
  activeTreatmentProgramInstanceRefs: TreatmentProgramTemplateUsageRef[];
  completedTreatmentProgramInstanceRefs: TreatmentProgramTemplateUsageRef[];
  publishedCourseRefs: TreatmentProgramTemplateUsageRef[];
  draftCourseRefs: TreatmentProgramTemplateUsageRef[];
  archivedCourseRefs: TreatmentProgramTemplateUsageRef[];
};

export const EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT: TreatmentProgramTemplateUsageSnapshot = {
  activeTreatmentProgramInstanceCount: 0,
  completedTreatmentProgramInstanceCount: 0,
  publishedCourseCount: 0,
  draftCourseCount: 0,
  archivedCourseCount: 0,
  activeTreatmentProgramInstanceRefs: [],
  completedTreatmentProgramInstanceRefs: [],
  publishedCourseRefs: [],
  draftCourseRefs: [],
  archivedCourseRefs: [],
};

/** Подтверждение перед переводом шаблона в архив: активные программы у пациентов или опубликованные курсы. */
export function treatmentProgramTemplateArchiveRequiresAcknowledgement(
  u: TreatmentProgramTemplateUsageSnapshot,
): boolean {
  return u.activeTreatmentProgramInstanceCount > 0 || u.publishedCourseCount > 0;
}

export type ArchiveTreatmentProgramTemplateOptions = {
  acknowledgeUsageWarning?: boolean;
};

export type CreateTreatmentProgramStageInput = {
  title: string;
  description?: string | null;
  sortOrder?: number;
};

export type UpdateTreatmentProgramStageInput = {
  title?: string;
  description?: string | null;
  sortOrder?: number;
};

export type CreateTreatmentProgramStageItemInput = {
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  sortOrder?: number;
  comment?: string | null;
  settings?: Record<string, unknown> | null;
};

export type UpdateTreatmentProgramStageItemInput = {
  itemType?: TreatmentProgramItemType;
  itemRefId?: string;
  sortOrder?: number;
  comment?: string | null;
  settings?: Record<string, unknown> | null;
};

export type TreatmentProgramInstanceStatus = "active" | "completed";

export type TreatmentProgramInstanceStageStatus =
  | "locked"
  | "available"
  | "in_progress"
  | "completed"
  | "skipped";

export type TreatmentProgramInstanceSummary = {
  id: string;
  patientUserId: string;
  templateId: string | null;
  assignedBy: string | null;
  title: string;
  status: TreatmentProgramInstanceStatus;
  createdAt: string;
  updatedAt: string;
};

export type TreatmentProgramInstanceStageItemRow = {
  id: string;
  stageId: string;
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  sortOrder: number;
  comment: string | null;
  localComment: string | null;
  settings: Record<string, unknown> | null;
  snapshot: Record<string, unknown>;
  completedAt: string | null;
};

/**
 * §6: отображаемый комментарий элемента экземпляра (приоритет у непустого `localComment` после trim).
 * Контракт API/UI: в БД не сохраняем пробельный `local_comment` как override — PATCH нормализует в `NULL`;
 * пустая строка в памяти ведёт себя как отсутствие override (fallback на `comment`).
 */
export function effectiveInstanceStageItemComment(row: {
  comment: string | null;
  localComment: string | null;
}): string | null {
  const local = row.localComment?.trim();
  if (local) return local;
  const c = row.comment?.trim();
  return c || null;
}

/** Подпись статуса этапа экземпляра для UI (§3 `SYSTEM_LOGIC_SCHEMA` — тот же смысл, что enum в API). */
export function formatTreatmentProgramStageStatusRu(status: TreatmentProgramInstanceStageStatus | string): string {
  switch (status) {
    case "locked":
      return "заблокирован";
    case "available":
      return "доступен";
    case "in_progress":
      return "в процессе";
    case "completed":
      return "завершён";
    case "skipped":
      return "пропущен";
    default:
      return typeof status === "string" ? status : String(status);
  }
}

export type TreatmentProgramInstanceStageItemView = TreatmentProgramInstanceStageItemRow & {
  effectiveComment: string | null;
};

export type TreatmentProgramInstanceStageRow = {
  id: string;
  instanceId: string;
  sourceStageId: string | null;
  title: string;
  description: string | null;
  sortOrder: number;
  localComment: string | null;
  skipReason: string | null;
  status: TreatmentProgramInstanceStageStatus;
};

export type TreatmentProgramInstanceDetail = TreatmentProgramInstanceSummary & {
  stages: Array<TreatmentProgramInstanceStageRow & { items: TreatmentProgramInstanceStageItemView[] }>;
};

/** §11 SYSTEM_LOGIC_SCHEMA — элементы `lfk_complex` активных экземпляров для интегратора (дневник / бот). */
export type TreatmentProgramIntegratorLfkBlock = {
  instanceId: string;
  instanceStatus: TreatmentProgramInstanceStatus;
  stageId: string;
  stageTitle: string;
  stageItemId: string;
  lfkComplexId: string;
  lfkComplexTitle: string | null;
};

export type TreatmentProgramInstanceStageInput = {
  sourceStageId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  status: TreatmentProgramInstanceStageStatus;
  items: Array<{
    itemType: TreatmentProgramItemType;
    itemRefId: string;
    sortOrder: number;
    comment: string | null;
    settings: Record<string, unknown> | null;
    snapshot: Record<string, unknown>;
  }>;
};

export type CreateTreatmentProgramInstanceTreeInput = {
  templateId: string;
  patientUserId: string;
  assignedBy: string | null;
  title: string;
  stages: TreatmentProgramInstanceStageInput[];
};

export type AddTreatmentProgramInstanceStageInput = {
  title: string;
  description?: string | null;
  sortOrder: number;
  status: TreatmentProgramInstanceStageStatus;
  sourceStageId?: string | null;
};

export type AddTreatmentProgramInstanceStageItemInput = {
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  sortOrder: number;
  comment: string | null;
  settings: Record<string, unknown> | null;
  snapshot: Record<string, unknown>;
};

export type ReplaceTreatmentProgramInstanceStageItemInput = {
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  sortOrder?: number;
  comment?: string | null;
  settings?: Record<string, unknown> | null;
  snapshot: Record<string, unknown>;
};

export type NormalizedTestDecision = "passed" | "failed" | "partial";

/** Подпись итога теста для UI (совпадает по смыслу с `normalized_decision` в API). */
export function formatNormalizedTestDecisionRu(decision: NormalizedTestDecision | string): string {
  switch (decision) {
    case "passed":
      return "зачтено";
    case "failed":
      return "не зачтено";
    case "partial":
      return "частично";
    default:
      return typeof decision === "string" ? decision : String(decision);
  }
}

export type TreatmentProgramTestAttemptRow = {
  id: string;
  instanceStageItemId: string;
  patientUserId: string;
  startedAt: string;
  completedAt: string | null;
};

export type TreatmentProgramTestResultRow = {
  id: string;
  attemptId: string;
  testId: string;
  rawValue: Record<string, unknown>;
  normalizedDecision: NormalizedTestDecision;
  decidedBy: string | null;
  createdAt: string;
};

/** Строка для doctor UI: результат + контекст этапа и теста. */
export type TreatmentProgramTestResultDetailRow = TreatmentProgramTestResultRow & {
  instanceStageItemId: string;
  stageId: string;
  stageTitle: string;
  stageSortOrder: number;
  testTitle: string | null;
};

/** §8 SYSTEM_LOGIC_SCHEMA — `treatment_program_events.event_type`. */
export const TREATMENT_PROGRAM_EVENT_TYPES = [
  "item_added",
  "item_removed",
  "item_replaced",
  "comment_changed",
  "stage_added",
  "stage_removed",
  "stage_skipped",
  "stage_completed",
  "status_changed",
  "test_completed",
] as const;

export type TreatmentProgramEventType = (typeof TREATMENT_PROGRAM_EVENT_TYPES)[number];

export type TreatmentProgramEventTargetType = "stage" | "stage_item" | "program";

export type TreatmentProgramEventRow = {
  id: string;
  instanceId: string;
  actorId: string | null;
  eventType: TreatmentProgramEventType;
  targetType: TreatmentProgramEventTargetType;
  targetId: string;
  payload: Record<string, unknown>;
  reason: string | null;
  createdAt: string;
};

export type AppendTreatmentProgramEventInput = {
  instanceId: string;
  actorId: string | null;
  eventType: TreatmentProgramEventType;
  targetType: TreatmentProgramEventTargetType;
  targetId: string;
  payload?: Record<string, unknown>;
  reason?: string | null;
};

/** Краткая подпись типа события для таймлайна врача. */
export function formatTreatmentProgramEventTypeRu(eventType: TreatmentProgramEventType | string): string {
  switch (eventType) {
    case "item_added":
      return "добавлен элемент этапа";
    case "item_removed":
      return "удалён элемент этапа";
    case "item_replaced":
      return "заменён элемент этапа";
    case "comment_changed":
      return "изменён комментарий к элементу";
    case "stage_added":
      return "добавлен этап";
    case "stage_removed":
      return "удалён этап";
    case "stage_skipped":
      return "этап пропущен";
    case "stage_completed":
      return "этап завершён";
    case "status_changed":
      return "изменён статус";
    case "test_completed":
      return "завершён тест";
    default:
      return typeof eventType === "string" ? eventType : String(eventType);
  }
}
