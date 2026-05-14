/** Совпадает с CHECK в `treatment_program_template_stage_items`. */
export const TREATMENT_PROGRAM_ITEM_TYPES = [
  "exercise",
  "lfk_complex",
  "recommendation",
  "lesson",
  "clinical_test",
] as const;

/** Основная секция каталога уроков в CMS webapp (`content_pages.section`). */
export const LESSON_CONTENT_SECTION = "lessons" as const;
/** Совместимый алиас из ранних версий SYSTEM_LOGIC_SCHEMA §4 — валидация принимает обе секции. */
export const LESSON_CONTENT_SECTION_LEGACY = "course_lessons" as const;

export type TreatmentProgramTemplateStatus = "draft" | "published" | "archived";

export type TreatmentProgramItemType = (typeof TREATMENT_PROGRAM_ITEM_TYPES)[number];

/** Миниатюра первого элемента шаблона в списке врача (когда удалось разрешить медиа на сервере). */
export type TreatmentProgramTemplateListPreviewMedia = {
  mediaUrl: string;
  mediaType: "image" | "video" | "gif";
};

export type TreatmentProgramTemplate = {
  id: string;
  title: string;
  description: string | null;
  status: TreatmentProgramTemplateStatus;
  /** Агрегаты для списка врача: этапы лечения без этапа 0 (общие рекомендации); элементы по всем этапам. */
  stageCount: number;
  itemCount: number;
  /** Превью первого элемента по порядку этапов (B6); иначе `null` — в UI остаётся иконка-заглушка. */
  listPreviewMedia: TreatmentProgramTemplateListPreviewMedia | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Системные группы этапа шаблона и экземпляра (`system_kind` в БД). */
export type TreatmentProgramInstanceStageSystemKind = "recommendations" | "tests";

export type TreatmentProgramTemplateStageGroup = {
  id: string;
  stageId: string;
  title: string;
  description: string | null;
  scheduleText: string | null;
  sortOrder: number;
  /** `NULL` — пользовательская группа; иначе системный блок шаблона. */
  systemKind: TreatmentProgramInstanceStageSystemKind | null;
};

export const TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_RECOMMENDATIONS = 101;
export const TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_SORT_TESTS = 102;

export const TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_RECOMMENDATIONS = "Рекомендации";
export const TREATMENT_PROGRAM_INSTANCE_SYSTEM_GROUP_TITLE_TESTS = "Тестирование";

/** Этап шаблона с `sort_order = 0` создаётся при создании шаблона. */
export const TREATMENT_PROGRAM_TEMPLATE_STAGE_ZERO_TITLE = "Общие рекомендации";

/** Заголовок инстанса при создании пустого индивидуального плана без шаблона. */
export const BLANK_INDIVIDUAL_PLAN_DEFAULT_TITLE = "Индивидуальный план";

/** Тег строки `recommendations`, созданной из экземпляра программы (свободный текст этапа 0). */
export const TREATMENT_PROGRAM_INSTANCE_FREEFORM_RECOMMENDATION_TAG = "tp_instance_freeform";

/** Счётчик этапов для списка и поля `TreatmentProgramTemplate.stageCount`: без этапа 0 (общие рекомендации). */
export function treatmentProgramTemplateStageCountForList(
  stages: readonly { sortOrder: number }[],
): number {
  return stages.reduce((n, s) => n + (s.sortOrder !== 0 ? 1 : 0), 0);
}

/** Группа внутри этапа экземпляра программы. */
export type TreatmentProgramInstanceStageGroup = {
  id: string;
  stageId: string;
  /** Группа шаблона, с которой скопирована строка (если есть). */
  sourceGroupId: string | null;
  title: string;
  description: string | null;
  scheduleText: string | null;
  sortOrder: number;
  /** `NULL` — пользовательская группа; иначе системный блок врача. */
  systemKind: TreatmentProgramInstanceStageSystemKind | null;
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

/** Разворачивание каталожного шаблона комплекса ЛФК в строки `exercise` этапа шаблона программы (без `lfk_complex`). */
export type ExpandLfkComplexIntoStageItemsMode = "new_group" | "ungrouped" | "existing_group";

export type ExpandLfkComplexIntoStageItemsBody =
  | {
      templateId: string;
      complexTemplateId: string;
      copyComplexDescriptionToGroup: boolean;
      mode: "new_group";
      newGroupTitle: string;
    }
  | {
      templateId: string;
      complexTemplateId: string;
      copyComplexDescriptionToGroup: boolean;
      mode: "ungrouped";
    }
  | {
      templateId: string;
      complexTemplateId: string;
      copyComplexDescriptionToGroup: boolean;
      mode: "existing_group";
      existingGroupId: string;
    };

export type LfkComplexExpandPreview = {
  exerciseIds: string[];
  complexDescription: string | null;
};

export type ExpandLfkComplexIntoStageItemsPortInput = {
  templateId: string;
  stageId: string;
  complexTemplateId: string;
  mode: ExpandLfkComplexIntoStageItemsMode;
  newGroupTitle?: string;
  existingGroupId?: string;
  copyComplexDescriptionToGroup: boolean;
  expectedExerciseIds: string[];
};

export type ExpandLfkComplexIntoStageItemsResult = {
  items: TreatmentProgramStageItem[];
  createdGroup?: TreatmentProgramTemplateStageGroup;
};

/** Развёртывание каталожного набора тестов в строки `clinical_test` в системной группе «Тестирование». */
export type ExpandTestSetIntoTemplateStageItemsPortInput = {
  templateId: string;
  stageId: string;
  testSetId: string;
};

export type ExpandTestSetIntoTemplateStageItemsResult = {
  added: number;
  skipped: number;
  items: TreatmentProgramStageItem[];
};

export type ExpandTestSetIntoInstanceStageItemsPortInput = {
  instanceId: string;
  stageId: string;
  testSetId: string;
};

export type ExpandTestSetIntoInstanceStageItemsResult = {
  added: number;
  skipped: number;
  items: TreatmentProgramInstanceStageItemRow[];
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
  /** Первый вход в `in_progress`; для старых `completed`/`skipped` без записи — `null`. */
  startedAt: string | null;
  goals: string | null;
  objectives: string | null;
  expectedDurationDays: number | null;
  expectedDurationText: string | null;
};

/** PATCH метаданных этапа экземпляра (название, описание, цели/срок); статус этапа — отдельным вызовом. */
export type UpdateTreatmentProgramInstanceStageMetadataInput = {
  title?: string;
  description?: string | null;
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
  sourceStageId: string | null;
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
  /** A3: группы шаблона для копирования; при назначении первыми вставляются системные (`systemKind`). Для прямого вызова `createInstanceTree` без системных строк: при ungrouped `recommendation`/`clinical_test` недостающие системные группы подставляются автоматически (`instance-tree-system-groups.ts`). */
  groups?: Array<{
    /** Для групп с шаблона — id группы шаблона; для системных групп — `null`. */
    sourceGroupId: string | null;
    title: string;
    description: string | null;
    scheduleText: string | null;
    sortOrder: number;
    systemKind?: TreatmentProgramInstanceStageSystemKind | null;
  }>;
};

export type CreateTreatmentProgramInstanceTreeInput = {
  templateId: string | null;
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
  /** Пациент отправил полный набор (все тесты в попытке). */
  submittedAt: string | null;
  /** Врач принял попытку (зачёт пункта). */
  acceptedAt: string | null;
  acceptedBy: string | null;
};

export type TreatmentProgramTestAttemptBrief = Pick<
  TreatmentProgramTestAttemptRow,
  "id" | "startedAt" | "submittedAt" | "acceptedAt"
>;

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
  attemptStartedAt: string;
  attemptSubmittedAt: string | null;
  attemptAcceptedAt: string | null;
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

/** Строка журнала `program_action_log` для read API / UI врача. */
export type ProgramActionLogListRow = {
  id: string;
  instanceId: string;
  instanceStageItemId: string;
  patientUserId: string;
  sessionId: string | null;
  actionType: ProgramActionType;
  payload: Record<string, unknown> | null;
  note: string | null;
  createdAt: string;
};

/** Краткая подпись типа записи журнала для врача (UX-02). */
export function formatProgramActionLogSummaryRu(row: ProgramActionLogListRow): string {
  if (row.actionType === "viewed") return "Просмотр элемента";
  if (row.actionType === "note") return "Заметка";
  const src = row.payload && typeof row.payload.source === "string" ? row.payload.source : null;
  if (src === "lfk_exercise_done") return "ЛФК: упражнение";
  if (src === "lfk_session") return "ЛФК: занятие (старый формат журнала)";
  if (src === "test_submitted") return "Тест отправлен";
  if (src === "simple_item_complete") return "Отметка выполнения (элемент)";
  if (src === "checklist_toggle") return "Чек-лист";
  return "Отметка выполнения";
}

export function formatLfkPostSessionDifficultyRu(d: unknown): string | null {
  if (d === "easy") return "легко";
  if (d === "medium") return "нормально";
  if (d === "hard") return "тяжело";
  return null;
}

/** Сложность занятия ЛФК в пост-сессионной форме (A4). */
export type LfkPostSessionDifficulty = "easy" | "medium" | "hard";

/** A4: результат теста без оценки врача для inbox «К проверке». */
export type PendingProgramTestEvaluationRow = {
  attemptId: string;
  /** ISO из `submitted_at` попытки; при текущих фильтрах выборки всегда задано. */
  attemptSubmittedAt: string;
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
      return "обновление статуса";
    case "test_completed":
      return "завершён тест";
    default:
      return typeof eventType === "string" ? eventType : String(eventType);
  }
}

/** Подписи этапов и пунктов для человекочитаемой ленты врача (без технических id). */
export type TreatmentProgramEventDoctorTimelineLabels = {
  itemTitle: (stageItemId: string) => string | undefined;
  stageTitle: (stageId: string) => string | undefined;
};

function formatTreatmentProgramInstanceStatusRu(status: string): string {
  if (status === "active") return "активна";
  if (status === "completed") return "завершена";
  return status;
}

function summarizeTreatmentProgramStatusChangedForDoctorRu(
  event: TreatmentProgramEventRow,
  labels: TreatmentProgramEventDoctorTimelineLabels,
  cached: { stageTitle: string; itemLabel: string },
): string {
  const p = event.payload ?? {};
  const scope = typeof p.scope === "string" ? p.scope : "";

  if (event.targetType === "program") {
    if (scope === "stages_reordered") return "Изменён порядок этапов";
    const from = p.from;
    const to = p.to;
    if (scope === "program" && typeof from === "string" && typeof to === "string") {
      return `Программа: ${formatTreatmentProgramInstanceStatusRu(from)} → ${formatTreatmentProgramInstanceStatusRu(to)}`;
    }
    return "Обновлена программа";
  }

  if (event.targetType === "stage") {
    if (scope === "stage_items_reordered") {
      return `Изменён порядок пунктов в этапе «${cached.stageTitle}»`;
    }
    if (scope === "stage_groups_reordered") {
      return `Изменён порядок групп в этапе «${cached.stageTitle}»`;
    }
    if (scope === "stage_group_added") {
      const t = typeof p.title === "string" ? p.title.trim() : "";
      return t
        ? `В этапе «${cached.stageTitle}» добавлена группа «${t}»`
        : `В этапе «${cached.stageTitle}» добавлена группа`;
    }
    if (scope === "stage_group_updated") {
      return `Обновлена группа в этапе «${cached.stageTitle}»`;
    }
    if (scope === "stage_group_removed") {
      const t = typeof p.title === "string" ? p.title.trim() : "";
      return t
        ? `Удалена группа «${t}» (этап «${cached.stageTitle}»)`
        : `Удалена группа (этап «${cached.stageTitle}»)`;
    }
    if (scope === "stage") {
      const from = p.from;
      const to = p.to;
      if (typeof from === "string" && typeof to === "string") {
        return `Этап «${cached.stageTitle}»: ${formatTreatmentProgramStageStatusRu(from)} → ${formatTreatmentProgramStageStatusRu(to)}`;
      }
    }
    return `Изменения в этапе «${cached.stageTitle}»`;
  }

  if (event.targetType === "stage_item") {
    if (p.field === "isActionable") {
      const v = p.value === true;
      return v
        ? `Рекомендация «${cached.itemLabel}» требует отметки выполнения`
        : `Рекомендация «${cached.itemLabel}» без отметки (справочно)`;
    }
    if (scope === "stage_item_group_changed") {
      return `Пункт «${cached.itemLabel}» перенесён в другую группу`;
    }
  }

  return "Обновление плана";
}

/**
 * Текст одной строки ленты «История изменений программы» для врача
 * (назначение выводится отдельно по `createdAt` экземпляра).
 */
export function summarizeTreatmentProgramEventForDoctorRu(
  event: TreatmentProgramEventRow,
  labels: TreatmentProgramEventDoctorTimelineLabels,
): string {
  const p = event.payload ?? {};
  const stageIdFromPayload = typeof p.stageId === "string" ? p.stageId : undefined;

  const itemLabel =
    event.targetType === "stage_item"
      ? (labels.itemTitle(event.targetId) ?? "пункт плана")
      : "пункт плана";

  const stageTitleForStageTarget =
    event.targetType === "stage" ? labels.stageTitle(event.targetId) : undefined;
  const stageTitle =
    stageTitleForStageTarget ??
    (stageIdFromPayload ? labels.stageTitle(stageIdFromPayload) : undefined) ??
    "Этап";

  switch (event.eventType) {
    case "item_added":
      return `Добавлен пункт «${itemLabel}» (этап «${stageTitle}»)`;
    case "item_removed":
      return `Удалён пункт «${itemLabel}»`;
    case "item_disabled":
      return `Пункт отключён: «${itemLabel}»`;
    case "item_enabled":
      return `Пункт снова включён: «${itemLabel}»`;
    case "item_replaced":
      return `Пункт заменён: «${itemLabel}»`;
    case "comment_changed":
      return `Обновлён комментарий к пункту «${itemLabel}»`;
    case "stage_added":
      return typeof p.title === "string" && p.title.trim()
        ? `Добавлен этап «${p.title.trim()}»`
        : "Добавлен этап";
    case "stage_removed":
      return typeof p.title === "string" && p.title.trim()
        ? `Удалён этап «${p.title.trim()}»`
        : "Удалён этап";
    case "stage_skipped":
      return `Этап «${stageTitle}» пропущен`;
    case "stage_completed":
      return `Этап «${stageTitle}» завершён`;
    case "test_completed": {
      const dec = p.normalizedDecision;
      const decRu =
        dec === "passed" || dec === "failed" || dec === "partial"
          ? formatNormalizedTestDecisionRu(dec)
          : typeof dec === "string"
            ? dec
            : "";
      const tail = decRu ? ` — ${decRu}` : "";
      return `Отправлен результат теста «${itemLabel}»${tail}`;
    }
    case "status_changed":
      return summarizeTreatmentProgramStatusChangedForDoctorRu(event, labels, {
        stageTitle,
        itemLabel,
      });
    default:
      return formatTreatmentProgramEventTypeRu(event.eventType);
  }
}

/** Скрыть в ленте врача: отметки выполнения пунктов пациентом (дублируют «Дневник занятий»). */
export function shouldOmitTreatmentProgramEventFromDoctorTimeline(event: TreatmentProgramEventRow): boolean {
  if (event.eventType !== "status_changed" || event.targetType !== "stage_item") return false;
  return event.payload?.field === "completedAt";
}
