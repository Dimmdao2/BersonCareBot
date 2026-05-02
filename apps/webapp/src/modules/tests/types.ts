/** Медиа-блок в JSON (как снимок для stage_item по SYSTEM_LOGIC_SCHEMA §4). */
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
  scoringConfig: unknown | null;
  media: ClinicalTestMediaItem[];
  tags: string[] | null;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClinicalTestFilter = {
  includeArchived?: boolean;
  search?: string | null;
  testType?: string | null;
  /** Зарезервировано под единый UI с упражнениями; список в БД пока не фильтрует. */
  regionRefId?: string | null;
  /** Зарезервировано под единый UI с упражнениями; список в БД пока не фильтрует. */
  loadType?: import("@/modules/lfk-exercises/types").ExerciseLoadType | null;
};

export type CreateClinicalTestInput = {
  title: string;
  description?: string | null;
  testType?: string | null;
  scoringConfig?: unknown | null;
  media?: ClinicalTestMediaItem[];
  tags?: string[] | null;
};

export type UpdateClinicalTestInput = {
  title?: string;
  description?: string | null;
  testType?: string | null;
  scoringConfig?: unknown | null;
  media?: ClinicalTestMediaItem[] | null;
  tags?: string[] | null;
};

export type TestSet = {
  id: string;
  title: string;
  description: string | null;
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
  test: Pick<ClinicalTest, "id" | "title" | "testType" | "isArchived">;
};

/** Фильтр по архиву в списке наборов: активные (по умолчанию), все, только архив. */
export type TestSetArchiveScope = "active" | "all" | "archived";

export type TestSetFilter = {
  /** @deprecated Используйте {@link archiveScope}: `includeArchived: true` эквивалентно `archiveScope: "all"`. */
  includeArchived?: boolean;
  archiveScope?: TestSetArchiveScope;
  search?: string | null;
};

export type CreateTestSetInput = {
  title: string;
  description?: string | null;
};

export type UpdateTestSetInput = {
  title?: string;
  description?: string | null;
};

export type TestSetItemInput = {
  testId: string;
  sortOrder: number;
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

