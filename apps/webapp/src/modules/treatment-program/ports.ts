import type {
  AddTreatmentProgramInstanceStageInput,
  AddTreatmentProgramInstanceStageItemInput,
  AppendTreatmentProgramEventInput,
  CreateTreatmentProgramStageInput,
  CreateTreatmentProgramStageItemInput,
  CreateTreatmentProgramTemplateInput,
  CreateTreatmentProgramTemplateStageGroupInput,
  CreateTreatmentProgramInstanceStageGroupInput,
  CreateTreatmentProgramInstanceTreeInput,
  ReplaceTreatmentProgramInstanceStageItemInput,
  TreatmentProgramEventRow,
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageGroup,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageRow,
  TreatmentProgramInstanceStageStatus,
  TreatmentProgramInstanceStageItemStatus,
  TreatmentProgramInstanceSummary,
  TreatmentProgramItemType,
  TreatmentProgramTemplate,
  TreatmentProgramTemplateDetail,
  TreatmentProgramTemplateFilter,
  TreatmentProgramTemplateUsageSnapshot,
  TreatmentProgramStage,
  TreatmentProgramStageItem,
  TreatmentProgramTemplateStageGroup,
  UpdateTreatmentProgramInstanceStageGroupInput,
  UpdateTreatmentProgramInstanceStageMetadataInput,
  TreatmentProgramTestAttemptRow,
  TreatmentProgramTestResultDetailRow,
  TreatmentProgramTestResultRow,
  NormalizedTestDecision,
  PendingProgramTestEvaluationRow,
  LfkComplexExpandPreview,
  ExpandLfkComplexIntoStageItemsPortInput,
  ExpandLfkComplexIntoStageItemsResult,
  ExpandTestSetIntoTemplateStageItemsPortInput,
  ExpandTestSetIntoTemplateStageItemsResult,
  ExpandTestSetIntoInstanceStageItemsPortInput,
  ExpandTestSetIntoInstanceStageItemsResult,
  ProgramActionLogInsert,
  ProgramActionLogListRow,
  UpdateTreatmentProgramStageInput,
  UpdateTreatmentProgramStageItemInput,
  UpdateTreatmentProgramTemplateStageGroupInput,
  UpdateTreatmentProgramTemplateInput,
} from "./types";

/** Контекст этапа шаблона для валидации элементов (`addStageItem` / `updateStageItem`). */
export type TreatmentProgramTemplateStageValidationContext = {
  sortOrder: number;
  groups: Array<Pick<TreatmentProgramTemplateStageGroup, "id" | "systemKind">>;
};

export type TreatmentProgramPort = {
  createTemplate(
    input: CreateTreatmentProgramTemplateInput,
    createdBy: string | null,
  ): Promise<TreatmentProgramTemplate>;
  updateTemplate(
    id: string,
    input: UpdateTreatmentProgramTemplateInput,
  ): Promise<TreatmentProgramTemplate | null>;
  getTemplateById(id: string): Promise<TreatmentProgramTemplateDetail | null>;
  getTemplateStageValidationContext(
    stageId: string,
  ): Promise<TreatmentProgramTemplateStageValidationContext | null>;
  listTemplates(filter: TreatmentProgramTemplateFilter): Promise<TreatmentProgramTemplate[]>;
  /** Перевод шаблона в `status = archived` (не физическое удаление строки). */
  deleteTemplate(id: string): Promise<boolean>;
  getTreatmentProgramTemplateUsageSummary(id: string): Promise<TreatmentProgramTemplateUsageSnapshot>;

  createStage(templateId: string, input: CreateTreatmentProgramStageInput): Promise<TreatmentProgramStage>;
  updateStage(stageId: string, input: UpdateTreatmentProgramStageInput): Promise<TreatmentProgramStage | null>;
  deleteStage(stageId: string): Promise<boolean>;

  addStageItem(stageId: string, input: CreateTreatmentProgramStageItemInput): Promise<TreatmentProgramStageItem>;
  getStageItemById(itemId: string): Promise<TreatmentProgramStageItem | null>;
  updateStageItem(
    itemId: string,
    input: UpdateTreatmentProgramStageItemInput,
  ): Promise<TreatmentProgramStageItem | null>;
  deleteStageItem(itemId: string): Promise<boolean>;

  createTemplateStageGroup(
    stageId: string,
    input: CreateTreatmentProgramTemplateStageGroupInput,
  ): Promise<TreatmentProgramTemplateStageGroup>;
  updateTemplateStageGroup(
    groupId: string,
    input: UpdateTreatmentProgramTemplateStageGroupInput,
  ): Promise<TreatmentProgramTemplateStageGroup | null>;
  deleteTemplateStageGroup(groupId: string): Promise<boolean>;
  reorderTemplateStageGroups(stageId: string, orderedGroupIds: string[]): Promise<boolean>;

  /** Каталожный шаблон комплекса ЛФК: порядок упражнений для развёртывания; `null`, если нет или в архиве. */
  getLfkComplexExpandPreview(complexTemplateId: string): Promise<LfkComplexExpandPreview | null>;
  /** Одна транзакция: группа (опционально) + вставка строк `exercise`. */
  expandLfkComplexIntoStageItems(
    input: ExpandLfkComplexIntoStageItemsPortInput,
  ): Promise<ExpandLfkComplexIntoStageItemsResult>;
  /** Развёртывание набора тестов в плоские `clinical_test` в системной группе «Тестирование». */
  expandTestSetIntoTemplateStageItems(
    input: ExpandTestSetIntoTemplateStageItemsPortInput,
  ): Promise<ExpandTestSetIntoTemplateStageItemsResult>;
};

/** Проверка полиморфной ссылки без FK на уровне БД — только в сервисе. */
export type TreatmentProgramItemRefValidationPort = {
  assertItemRefExists(type: TreatmentProgramItemType, itemRefId: string): Promise<void>;
};

/** Снимок блока библиотеки на момент назначения (§4 SYSTEM_LOGIC_SCHEMA). */
export type TreatmentProgramItemSnapshotPort = {
  buildSnapshot(type: TreatmentProgramItemType, itemRefId: string): Promise<Record<string, unknown>>;
};

export type TreatmentProgramInstancePort = {
  createInstanceTree(input: CreateTreatmentProgramInstanceTreeInput): Promise<TreatmentProgramInstanceDetail>;
  getInstanceById(id: string): Promise<TreatmentProgramInstanceDetail | null>;
  getInstanceForPatient(
    patientUserId: string,
    instanceId: string,
  ): Promise<TreatmentProgramInstanceDetail | null>;
  listInstancesForPatient(patientUserId: string): Promise<TreatmentProgramInstanceSummary[]>;
  updateStageItemLocalComment(
    instanceId: string,
    stageItemId: string,
    localComment: string | null,
  ): Promise<TreatmentProgramInstanceStageItemRow | null>;
  updateInstanceMeta(
    instanceId: string,
    patch: { title?: string; status?: "active" | "completed" },
  ): Promise<TreatmentProgramInstanceSummary | null>;

  /** §3: смена статуса этапа + skip_reason при skipped (валидация в сервисе). */
  updateInstanceStage(
    instanceId: string,
    stageId: string,
    patch: { status: TreatmentProgramInstanceStageStatus; skipReason?: string | null },
  ): Promise<TreatmentProgramInstanceStageRow | null>;

  /** Цели/задачи/срок этапа (A1); не меняет FSM статуса. */
  updateInstanceStageMetadata(
    instanceId: string,
    stageId: string,
    patch: UpdateTreatmentProgramInstanceStageMetadataInput,
  ): Promise<TreatmentProgramInstanceStageRow | null>;

  setStageItemCompletedAt(
    instanceId: string,
    itemId: string,
    completedAt: string | null,
  ): Promise<TreatmentProgramInstanceStageItemRow | null>;

  patchInstanceStageItem(
    instanceId: string,
    itemId: string,
    patch: {
      status?: TreatmentProgramInstanceStageItemStatus;
      isActionable?: boolean | null;
      groupId?: string | null;
      /** Полная замена JSON `settings` (`null` — очистить колонку). */
      settings?: Record<string, unknown> | null;
    },
  ): Promise<TreatmentProgramInstanceStageItemRow | null>;

  /**
   * A2-TXN-01: одна транзакция БД — PATCH элемента + вставка строки события (PG);
   * in-memory: последовательно в одном замыкании. Вызывать только из сервисного слоя с уже нормализованным `eventInput`.
   */
  patchInstanceStageItemWithEvent(
    instanceId: string,
    itemId: string,
    patch: {
      status?: TreatmentProgramInstanceStageItemStatus;
      isActionable?: boolean | null;
      groupId?: string | null;
      settings?: Record<string, unknown> | null;
    },
    eventInput: AppendTreatmentProgramEventInput,
  ): Promise<TreatmentProgramInstanceStageItemRow | null>;

  addInstanceStage(
    instanceId: string,
    input: AddTreatmentProgramInstanceStageInput,
  ): Promise<TreatmentProgramInstanceStageRow | null>;
  removeInstanceStage(instanceId: string, stageId: string): Promise<boolean>;
  addInstanceStageItem(
    instanceId: string,
    stageId: string,
    input: AddTreatmentProgramInstanceStageItemInput,
  ): Promise<TreatmentProgramInstanceStageItemRow | null>;
  /** Развёртывание набора в строки `clinical_test` (снимок на каждую строку). */
  expandTestSetIntoInstanceStageItems(
    input: ExpandTestSetIntoInstanceStageItemsPortInput,
  ): Promise<ExpandTestSetIntoInstanceStageItemsResult | null>;
  replaceInstanceStageItem(
    instanceId: string,
    itemId: string,
    input: ReplaceTreatmentProgramInstanceStageItemInput,
  ): Promise<TreatmentProgramInstanceStageItemRow | null>;

  /** Перенумерация `sort_order` этапов (0..n-1) в заданном порядке; множество id должно совпадать с этапами экземпляра. */
  reorderInstanceStages(instanceId: string, orderedStageIds: string[]): Promise<boolean>;
  /** Перенумерация элементов этапа. */
  reorderInstanceStageItems(
    instanceId: string,
    stageId: string,
    orderedItemIds: string[],
  ): Promise<boolean>;

  createInstanceStageGroup(
    instanceId: string,
    stageId: string,
    input: CreateTreatmentProgramInstanceStageGroupInput,
  ): Promise<TreatmentProgramInstanceStageGroup | null>;
  updateInstanceStageGroup(
    instanceId: string,
    groupId: string,
    input: UpdateTreatmentProgramInstanceStageGroupInput,
  ): Promise<TreatmentProgramInstanceStageGroup | null>;
  /** Элементы группы получают `group_id = NULL`. */
  deleteInstanceStageGroup(instanceId: string, groupId: string): Promise<boolean>;
  reorderInstanceStageGroups(
    instanceId: string,
    stageId: string,
    orderedGroupIds: string[],
  ): Promise<boolean>;

  /** A5: пациент открыл экран программы (Today-бейдж «План обновлён»). */
  touchPatientPlanLastOpenedAt(patientUserId: string, instanceId: string): Promise<void>;
  /**
   * A5: первая отметка «элемент открыт» — только если `last_viewed_at IS NULL` (идемпотентно).
   * Возвращает `updated: true`, если строка изменилась.
   */
  markStageItemViewedIfNever(
    patientUserId: string,
    instanceId: string,
    stageItemId: string,
  ): Promise<{ updated: boolean }>;
};

/** §8: история изменений экземпляра программы (только через сервисный слой). */
export type TreatmentProgramEventsPort = {
  appendEvent(input: AppendTreatmentProgramEventInput): Promise<TreatmentProgramEventRow>;
  listEventsForInstance(instanceId: string, limit?: number): Promise<TreatmentProgramEventRow[]>;
  /** A5: max(created_at) по событиям, влияющим на бейдж «План обновлён»; нет строк — `null`. */
  getMaxPlanMutationEventCreatedAt(instanceId: string): Promise<string | null>;
};

/** Попытки и результаты тестов в программе (фаза 6). */
export type TreatmentProgramTestAttemptsPort = {
  findOpenAttempt(
    stageItemId: string,
    patientUserId: string,
  ): Promise<TreatmentProgramTestAttemptRow | null>;
  createAttempt(input: {
    stageItemId: string;
    patientUserId: string;
  }): Promise<TreatmentProgramTestAttemptRow>;
  completeAttempt(attemptId: string): Promise<void>;
  upsertResult(input: {
    attemptId: string;
    testId: string;
    rawValue: Record<string, unknown>;
    normalizedDecision: NormalizedTestDecision;
    decidedBy: string | null;
  }): Promise<TreatmentProgramTestResultRow>;
  listResultsForAttempt(attemptId: string): Promise<TreatmentProgramTestResultRow[]>;
  listResultDetailsForInstance(instanceId: string): Promise<TreatmentProgramTestResultDetailRow[]>;
  overrideResultDecision(
    resultId: string,
    input: { normalizedDecision: NormalizedTestDecision; decidedBy: string },
  ): Promise<TreatmentProgramTestResultRow | null>;
  /** Есть ли хотя бы одна попытка теста по элементу (включая завершённые) — для защиты истории при удалении/замене. */
  hasAnyAttemptForStageItem(stageItemId: string): Promise<boolean>;
  /**
   * A4: результаты с `decided_by IS NULL` по **активным** экземплярам программ пациента (inbox врача).
   */
  listPendingEvaluationResultsForPatient(patientUserId: string): Promise<PendingProgramTestEvaluationRow[]>;
};

export type ProgramActionLogPort = {
  insertAction(input: ProgramActionLogInsert): Promise<{ id: string; createdAt: string }>;
  /** Удаляет «простые» `done` за окно (не трогает `test_submitted` / `lfk_exercise_done`). */
  deleteSimpleDoneInWindow(params: {
    instanceId: string;
    patientUserId: string;
    instanceStageItemId: string;
    windowStartIso: string;
    windowEndIso: string;
  }): Promise<void>;
  /** Удаляет все `done` за окно по элементу (перезапись ЛФК за день). */
  deleteAllDoneInWindow(params: {
    instanceId: string;
    patientUserId: string;
    instanceStageItemId: string;
    windowStartIso: string;
    windowEndIso: string;
  }): Promise<void>;
  listDoneItemIdsInWindow(params: {
    instanceId: string;
    patientUserId: string;
    windowStartIso: string;
    windowEndIso: string;
  }): Promise<string[]>;
  /** Число записей `done` за окно по каждому элементу (для UI «сколько раз сегодня»). */
  countDoneByItemInWindow(params: {
    instanceId: string;
    patientUserId: string;
    windowStartIso: string;
    windowEndIso: string;
  }): Promise<Record<string, number>>;
  /** Последний `created_at` отметки `done` по каждому элементу экземпляра (все сроки). */
  lastDoneAtIsoByItemForInstance(params: {
    instanceId: string;
    patientUserId: string;
  }): Promise<Record<string, string>>;
  /**
   * Число «событий выполнения» по каждому элементу за всё время экземпляра:
   * COUNT(DISTINCT COALESCE(session_id, id)) среди action_type = done (одна ЛФК-сессия = один раз).
   */
  countCompletionEventsByItemForInstance(params: {
    instanceId: string;
    patientUserId: string;
  }): Promise<Record<string, number>>;
  /** Число `done` за окно по ключу активности (см. `programActionDoneActivityKey`). */
  countDoneByActivityKeyInWindow(params: {
    instanceId: string;
    patientUserId: string;
    windowStartIso: string;
    windowEndIso: string;
  }): Promise<Record<string, number>>;
  /** Последний `created_at` по ключу активности за всё время экземпляра. */
  lastDoneAtIsoByActivityKeyForInstance(params: {
    instanceId: string;
    patientUserId: string;
  }): Promise<Record<string, string>>;
  /**
   * Число различных календарных дней в зоне {@link params.displayIana}, в которых есть хотя бы одна отметка `done`
   * в полуинтервале {@link params.windowStartUtcIso} ≤ created_at &lt; {@link params.windowEndUtcExclusiveIso}.
   */
  countDistinctLocalCalendarDaysWithDoneInWindow(params: {
    instanceId: string;
    patientUserId: string;
    windowStartUtcIso: string;
    windowEndUtcExclusiveIso: string;
    /** IANA, уже проверенная вызывающим кодом (Luxon `isValid`). */
    displayIana: string;
  }): Promise<number>;
  /** Журнал действий пациента по экземпляру (новые сверху), для UI врача (UX-02). */
  listForInstance(params: { instanceId: string; limit?: number }): Promise<ProgramActionLogListRow[]>;
};
