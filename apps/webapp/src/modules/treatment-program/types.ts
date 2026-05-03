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

export type TreatmentProgramTemplateStageGroup = {
  id: string;
  stageId: string;
  title: string;
  description: string | null;
  scheduleText: string | null;
  sortOrder: number;
};

export type TreatmentProgramInstanceStageGroup = {
  id: string;
  stageId: string;
  /** Группа шаблона, с которой скопирована строка (если есть). */
  sourceGroupId: string | null;
  title: string;
  description: string | null;
  scheduleText: string | null;
  sortOrder: number;
};

export type TreatmentProgramStage = {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  /** Markdown. */
  goals: string | null;
  /**
   * Markdown (O1 PROGRAM_PATIENT_SHAPE: хранится как TEXT, без JSONB-чеклиста).
   */
  objectives: string | null;
  expectedDurationDays: number | null;
  expectedDurationText: string | null;
};

export type TreatmentProgramStageItem = {
  id: string;
  stageId: string;
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  sortOrder: number;
  comment: string | null;
  settings: Record<string, unknown> | null;
  /** A3: группа внутри этапа; `null` — вне групп. */
  groupId: string | null;
};

export type TreatmentProgramTemplateDetail = TreatmentProgramTemplate & {
  stages: Array<
    TreatmentProgramStage & {
      groups: TreatmentProgramTemplateStageGroup[];
      items: TreatmentProgramStageItem[];
    }
  >;
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
  goals?: string | null;
  objectives?: string | null;
  expectedDurationDays?: number | null;
  expectedDurationText?: string | null;
};

export type UpdateTreatmentProgramStageInput = {
  title?: string;
  description?: string | null;
  sortOrder?: number;
  goals?: string | null;
  objectives?: string | null;
  expectedDurationDays?: number | null;
  expectedDurationText?: string | null;
};

export type CreateTreatmentProgramStageItemInput = {
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  sortOrder?: number;
  comment?: string | null;
  settings?: Record<string, unknown> | null;
  groupId?: string | null;
};

export type UpdateTreatmentProgramStageItemInput = {
  itemType?: TreatmentProgramItemType;
  itemRefId?: string;
  sortOrder?: number;
  comment?: string | null;
  settings?: Record<string, unknown> | null;
  groupId?: string | null;
};

export type CreateTreatmentProgramTemplateStageGroupInput = {
  title: string;
  description?: string | null;
  scheduleText?: string | null;
  sortOrder?: number;
};

export type UpdateTreatmentProgramTemplateStageGroupInput = {
  title?: string;
  description?: string | null;
  scheduleText?: string | null;
  sortOrder?: number;
};

export type CreateTreatmentProgramInstanceStageGroupInput = {
  title: string;
  description?: string | null;
  scheduleText?: string | null;
  sortOrder?: number;
};

export type UpdateTreatmentProgramInstanceStageGroupInput = {
  title?: string;
  description?: string | null;
  scheduleText?: string | null;
  sortOrder?: number;
};

export type TreatmentProgramInstanceStatus = "active" | "completed";

export type TreatmentProgramInstanceStageStatus =
  | "locked"
  | "available"
  | "in_progress"
  | "completed"
  | "skipped";

/** A2: строка элемента экземпляра — `active` / `disabled` (без физического удаления). */
export type TreatmentProgramInstanceStageItemStatus = "active" | "disabled";

export type TreatmentProgramInstanceSummary = {
  id: string;
  patientUserId: string;
  templateId: string | null;
  assignedBy: string | null;
  title: string;
  status: TreatmentProgramInstanceStatus;
  createdAt: string;
  updatedAt: string;
  /** A5: последний раз пациент открывал экран программы (сброс «План обновлён»). */
  patientPlanLastOpenedAt: string | null;
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
  /**
   * O4: только на экземпляре. `false` для `recommendation` = постоянная рекомендация;
   * `true` / `null` = требует выполнения (null трактуем как actionable для обратной совместимости).
   */
  isActionable: boolean | null;
  status: TreatmentProgramInstanceStageItemStatus;
  /** A3: группа внутри этапа экземпляра; `null` — вне групп. */
  groupId: string | null;
  /** A5: время создания строки элемента. */
  createdAt: string;
  /** A5: `null` — элемент ещё не открывался пациентом после добавления врачом (бейдж «Новое»). */
  lastViewedAt: string | null;
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
  goals: string | null;
  objectives: string | null;
  expectedDurationDays: number | null;
  expectedDurationText: string | null;
};

/** PATCH метаданных этапа экземпляра (цели/срок); статус этапа — отдельным вызовом. */
export type UpdateTreatmentProgramInstanceStageMetadataInput = {
  goals?: string | null;
  objectives?: string | null;
  expectedDurationDays?: number | null;
  expectedDurationText?: string | null;
};

export type TreatmentProgramInstanceDetail = TreatmentProgramInstanceSummary & {
  stages: Array<
    TreatmentProgramInstanceStageRow & {
      groups: TreatmentProgramInstanceStageGroup[];
      items: TreatmentProgramInstanceStageItemView[];
    }
  >;
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
  goals: string | null;
  objectives: string | null;
  expectedDurationDays: number | null;
  expectedDurationText: string | null;
  items: Array<{
    itemType: TreatmentProgramItemType;
    itemRefId: string;
    sortOrder: number;
    comment: string | null;
    settings: Record<string, unknown> | null;
    snapshot: Record<string, unknown>;
    isActionable?: boolean | null;
    status?: TreatmentProgramInstanceStageItemStatus;
    /** A3: id группы **шаблона**; при копировании маппится в группу экземпляра. */
    templateGroupId?: string | null;
  }>;
  /** A3: группы шаблона для копирования (порядок по `sortOrder`). */
  groups?: Array<{
    sourceGroupId: string;
    title: string;
    description: string | null;
    scheduleText: string | null;
    sortOrder: number;
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
  goals?: string | null;
  objectives?: string | null;
  expectedDurationDays?: number | null;
  expectedDurationText?: string | null;
};

export type AddTreatmentProgramInstanceStageItemInput = {
  itemType: TreatmentProgramItemType;
  itemRefId: string;
  sortOrder: number;
  comment: string | null;
  settings: Record<string, unknown> | null;
  snapshot: Record<string, unknown>;
  isActionable?: boolean | null;
  status?: TreatmentProgramInstanceStageItemStatus;
  groupId?: string | null;
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

/** A4 PROGRAM_PATIENT_SHAPE: типы строк `program_action_log`. */
export const PROGRAM_ACTION_TYPES = ["done", "viewed", "note"] as const;
export type ProgramActionType = (typeof PROGRAM_ACTION_TYPES)[number];

export type ProgramActionLogInsert = {
  instanceId: string;
  instanceStageItemId: string;
  patientUserId: string;
  sessionId?: string | null;
  actionType: ProgramActionType;
  payload?: Record<string, unknown> | null;
  note?: string | null;
};

/** Сложность занятия ЛФК в пост-сессионной форме (A4). */
export type LfkPostSessionDifficulty = "easy" | "medium" | "hard";

/** A4: результат теста без оценки врача для inbox «К проверке». */
export type PendingProgramTestEvaluationRow = {
  resultId: string;
  testId: string;
  testTitle: string | null;
  createdAt: string;
  instanceId: string;
  instanceTitle: string;
  stageTitle: string;
  stageItemId: string;
};

/** §8 SYSTEM_LOGIC_SCHEMA — `treatment_program_events.event_type`. */
export const TREATMENT_PROGRAM_EVENT_TYPES = [
  "item_added",
  "item_removed",
  "item_disabled",
  "item_enabled",
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

/** A5: события, влияющие на бейдж «План обновлён» на Today (без прогресса пациента по тестам/завершения этапа). */
export const TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES: readonly TreatmentProgramEventType[] = [
  "item_added",
  "item_removed",
  "item_disabled",
  "item_enabled",
  "item_replaced",
  "comment_changed",
  "stage_added",
  "stage_removed",
  "stage_skipped",
  "status_changed",
];

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
    case "item_disabled":
      return "элемент отключён";
    case "item_enabled":
      return "элемент включён";
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
