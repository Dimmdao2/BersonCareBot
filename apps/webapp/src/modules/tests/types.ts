import type { ClinicalTestScoring } from "./clinicalTestScoring";

export type ClinicalTestMediaItem = {
  mediaUrl: string;
  mediaType: "image" | "video" | "gif";
  sortOrder: number;
};

export type ClinicalTest = {
  id: string;
  title: string;
  description: string | null;
  testType: string | null;
  /** Legacy JSON; не удаляется в B2 — см. ТЗ. При успешном сохранении структурированного `scoring` может обнуляться приложением. */
  scoringConfig: unknown | null;
  /** Структурированная оценка (B2); при null на чтении репозиторий может вывести из `scoring_config`. */
  scoring: ClinicalTestScoring | null;
  /** Fallback / legacy перенос / свободный текст. */
  rawText: string | null;
  /** Код из справочника `clinical_assessment_kind` (`reference_items.code`) или произвольный legacy-код на чтении. */
  assessmentKind: string | null;
  /** FK `reference_items.id` (категория регионов тела). */
  bodyRegionId: string | null;
  media: ClinicalTestMediaItem[];
  tags: string[] | null;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClinicalTestFilter = {
  includeArchived?: boolean;
  /** @deprecated Используйте {@link archiveScope}: `includeArchived: true` эквивалентно `archiveScope: "all"`. */
  archiveScope?: TestSetArchiveScope;
  search?: string | null;
  testType?: string | null;
  /** Фильтр по региону тела (`tests.body_region_id`). */
  regionRefId?: string | null;
  /** Фильтр по виду оценки (`tests.assessment_kind`), код из справочника `clinical_assessment_kind`. */
  assessmentKind?: string | null;
};

export type CreateClinicalTestInput = {
  title: string;
  description?: string | null;
  testType?: string | null;
  /** Код из справочника `clinical_assessment_kind` или null. */
  assessmentKind?: string | null;
  bodyRegionId?: string | null;
  scoring?: ClinicalTestScoring | null;
  rawText?: string | null;
  scoringConfig?: unknown | null;
  media?: ClinicalTestMediaItem[];
  tags?: string[] | null;
};

export type UpdateClinicalTestInput = {
  title?: string;
  description?: string | null;
  testType?: string | null;
  assessmentKind?: string | null;
  bodyRegionId?: string | null;
  scoring?: ClinicalTestScoring | null;
  rawText?: string | null;
  scoringConfig?: unknown | null;
  media?: ClinicalTestMediaItem[] | null;
  tags?: string[] | null;
};

/** Публикация набора в каталоге (независимо от архива). */
export type TestSetPublicationStatus = "draft" | "published";

export type TestSet = {
  id: string;
  title: string;
  description: string | null;
  publicationStatus: TestSetPublicationStatus;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: TestSetItemWithTest[];
};

export type TestSetItemWithTest = {
  id: string;
  testSetId: string;
  testId: string;
  sortOrder: number;
  comment: string | null;
  test: Pick<ClinicalTest, "id" | "title" | "testType" | "isArchived"> & {
    /** Первое медиа по `sort_order` для превью в редакторе набора. */
    previewMedia: ClinicalTestMediaItem | null;
  };
};

/** Фильтр по архиву в списке наборов: активные (по умолчанию), все, только архив. */
export type TestSetArchiveScope = "active" | "all" | "archived";

/** Ось публикации в списке наборов тестов. */
export type TestSetPublicationScope = "all" | "draft" | "published";

export type TestSetFilter = {
  /** @deprecated Используйте {@link archiveScope}: `includeArchived: true` эквивалентно `archiveScope: "all"`. */
  includeArchived?: boolean;
  archiveScope?: TestSetArchiveScope;
  publicationScope?: TestSetPublicationScope;
  search?: string | null;
};

export type CreateTestSetInput = {
  title: string;
  description?: string | null;
  publicationStatus?: TestSetPublicationStatus;
};

export type UpdateTestSetInput = {
  title?: string;
  description?: string | null;
  publicationStatus?: TestSetPublicationStatus;
};

export type TestSetItemInput = {
  testId: string;
  sortOrder: number;
  comment?: string | null;
};

/** Сколько сущностей отдаём в UI подробно (остальное — только счётчик). */
export const CLINICAL_TEST_USAGE_DETAIL_LIMIT = 12;

/** Одна ссылка «где используется» для клинического теста. */
export type ClinicalTestUsageRef =
  | { kind: "test_set"; id: string; title: string }
  | { kind: "treatment_program_template"; id: string; title: string }
  | { kind: "treatment_program_instance"; id: string; title: string; patientUserId: string };

/** Read-only сводка для блока «где используется» и guard архивации. */
export type ClinicalTestUsageSnapshot = {
  /** Наборы, где тест ещё входит в состав и набор не архивирован. */
  nonArchivedTestSetsContainingCount: number;
  /** Наборы только в архиве (история). */
  archivedTestSetsContainingCount: number;
  publishedTreatmentProgramTemplateCount: number;
  draftTreatmentProgramTemplateCount: number;
  /** Шаблоны программ в статусе `archived` (история, не блокирует архив теста). */
  archivedTreatmentProgramTemplateCount: number;
  activeTreatmentProgramInstanceCount: number;
  completedTreatmentProgramInstanceCount: number;
  /** Строки в `test_results` для этого `test_id` (история, не блокирует архив). */
  testResultsRecordedCount: number;
  nonArchivedTestSetRefs: ClinicalTestUsageRef[];
  archivedTestSetRefs: ClinicalTestUsageRef[];
  publishedTreatmentProgramTemplateRefs: ClinicalTestUsageRef[];
  draftTreatmentProgramTemplateRefs: ClinicalTestUsageRef[];
  archivedTreatmentProgramTemplateRefs: ClinicalTestUsageRef[];
  activeTreatmentProgramInstanceRefs: ClinicalTestUsageRef[];
  completedTreatmentProgramInstanceRefs: ClinicalTestUsageRef[];
};

export const EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT: ClinicalTestUsageSnapshot = {
  nonArchivedTestSetsContainingCount: 0,
  archivedTestSetsContainingCount: 0,
  publishedTreatmentProgramTemplateCount: 0,
  draftTreatmentProgramTemplateCount: 0,
  archivedTreatmentProgramTemplateCount: 0,
  activeTreatmentProgramInstanceCount: 0,
  completedTreatmentProgramInstanceCount: 0,
  testResultsRecordedCount: 0,
  nonArchivedTestSetRefs: [],
  archivedTestSetRefs: [],
  publishedTreatmentProgramTemplateRefs: [],
  draftTreatmentProgramTemplateRefs: [],
  archivedTreatmentProgramTemplateRefs: [],
  activeTreatmentProgramInstanceRefs: [],
  completedTreatmentProgramInstanceRefs: [],
};

/** Требуется явное подтверждение архивации (см. ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN). */
export function clinicalTestArchiveRequiresAcknowledgement(u: ClinicalTestUsageSnapshot): boolean {
  return (
    u.nonArchivedTestSetsContainingCount > 0 ||
    u.publishedTreatmentProgramTemplateCount > 0 ||
    u.activeTreatmentProgramInstanceCount > 0
  );
}

export type ArchiveClinicalTestOptions = {
  acknowledgeUsageWarning?: boolean;
};

/** Сколько сущностей отдаём в UI подробно (наборы тестов — «где используется»). */
export const TEST_SET_USAGE_DETAIL_LIMIT = 12;

export type TestSetUsageRef =
  | { kind: "treatment_program_template"; id: string; title: string }
  | { kind: "treatment_program_instance"; id: string; title: string; patientUserId: string };

export type TestSetUsageSnapshot = {
  publishedTreatmentProgramTemplateCount: number;
  draftTreatmentProgramTemplateCount: number;
  archivedTreatmentProgramTemplateCount: number;
  activeTreatmentProgramInstanceCount: number;
  completedTreatmentProgramInstanceCount: number;
  /** Попытки прохождения блока набора в экземплярах программ (история, не блокирует архив). */
  testAttemptsRecordedCount: number;
  publishedTreatmentProgramTemplateRefs: TestSetUsageRef[];
  draftTreatmentProgramTemplateRefs: TestSetUsageRef[];
  archivedTreatmentProgramTemplateRefs: TestSetUsageRef[];
  activeTreatmentProgramInstanceRefs: TestSetUsageRef[];
  completedTreatmentProgramInstanceRefs: TestSetUsageRef[];
};

export const EMPTY_TEST_SET_USAGE_SNAPSHOT: TestSetUsageSnapshot = {
  publishedTreatmentProgramTemplateCount: 0,
  draftTreatmentProgramTemplateCount: 0,
  archivedTreatmentProgramTemplateCount: 0,
  activeTreatmentProgramInstanceCount: 0,
  completedTreatmentProgramInstanceCount: 0,
  testAttemptsRecordedCount: 0,
  publishedTreatmentProgramTemplateRefs: [],
  draftTreatmentProgramTemplateRefs: [],
  archivedTreatmentProgramTemplateRefs: [],
  activeTreatmentProgramInstanceRefs: [],
  completedTreatmentProgramInstanceRefs: [],
};

/** См. `ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md` раздел 4 (Guard архива) — не путать с полной сводкой по статусам шаблонов. */
export function testSetArchiveRequiresAcknowledgement(u: TestSetUsageSnapshot): boolean {
  return u.publishedTreatmentProgramTemplateCount > 0 || u.activeTreatmentProgramInstanceCount > 0;
}

export type ArchiveTestSetOptions = {
  acknowledgeUsageWarning?: boolean;
};

