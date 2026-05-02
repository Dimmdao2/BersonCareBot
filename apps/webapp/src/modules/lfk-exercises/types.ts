import type { MediaPreviewStatus } from "@/modules/media/types";
import type { RecommendationListFilterScope } from "@/shared/lib/doctorCatalogListStatus";

export type ExerciseLoadType = "strength" | "stretch" | "balance" | "cardio" | "other";

export type ExerciseMediaType = "image" | "video" | "gif";

export type ExerciseMedia = {
  id: string;
  exerciseId: string;
  mediaUrl: string;
  mediaType: ExerciseMediaType;
  sortOrder: number;
  createdAt: string;
  /** Library grid preview (joined from `media_files` when `mediaUrl` is `/api/media/{uuid}`). */
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus;
};

export type Exercise = {
  id: string;
  title: string;
  description: string | null;
  regionRefId: string | null;
  loadType: ExerciseLoadType | null;
  difficulty1_10: number | null;
  contraindications: string | null;
  tags: string[] | null;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  media: ExerciseMedia[];
};

export type ExerciseFilter = {
  regionRefId?: string | null;
  loadType?: ExerciseLoadType | null;
  difficultyMin?: number | null;
  difficultyMax?: number | null;
  tags?: string[] | null;
  includeArchived?: boolean;
  /** Активные / все / только архив. Имеет приоритет над устаревшим `includeArchived`. */
  archiveListScope?: RecommendationListFilterScope;
  search?: string | null;
};

export type ExerciseMediaInput = {
  mediaUrl: string;
  mediaType: ExerciseMediaType;
  sortOrder?: number;
};

export type CreateExerciseInput = {
  title: string;
  description?: string | null;
  regionRefId?: string | null;
  loadType?: ExerciseLoadType | null;
  difficulty1_10?: number | null;
  contraindications?: string | null;
  tags?: string[] | null;
  media?: ExerciseMediaInput[];
};

export type UpdateExerciseInput = {
  title?: string;
  description?: string | null;
  regionRefId?: string | null;
  loadType?: ExerciseLoadType | null;
  difficulty1_10?: number | null;
  contraindications?: string | null;
  tags?: string[] | null;
  media?: ExerciseMediaInput[] | null;
};

/** Сколько сущностей отдаём в UI подробно (остальное — только счётчик). */
export const EXERCISE_USAGE_DETAIL_LIMIT = 12;

/** Одна ссылка «где используется» (id — id сущности в БД, кроме назначения ЛФК: там id строки назначения для ключа в UI). */
export type ExerciseUsageRef =
  | { kind: "lfk_complex_template" | "treatment_program_template"; id: string; title: string }
  | {
      kind: "treatment_program_instance" | "patient_lfk_assignment_client";
      id: string;
      title: string;
      patientUserId: string;
    };

/** Read-only counters for doctor «где используется» / archive guard (упражнения). */
export type ExerciseUsageSnapshot = {
  publishedLfkComplexTemplateCount: number;
  draftLfkComplexTemplateCount: number;
  activePatientLfkAssignmentCount: number;
  publishedTreatmentProgramTemplateCount: number;
  draftTreatmentProgramTemplateCount: number;
  activeTreatmentProgramInstanceCount: number;
  /** Завершённые экземпляры программ (только сводка «в истории», не блокирует архив). */
  completedTreatmentProgramInstanceCount: number;
  publishedLfkComplexTemplateRefs: ExerciseUsageRef[];
  draftLfkComplexTemplateRefs: ExerciseUsageRef[];
  publishedTreatmentProgramTemplateRefs: ExerciseUsageRef[];
  draftTreatmentProgramTemplateRefs: ExerciseUsageRef[];
  activeTreatmentProgramInstanceRefs: ExerciseUsageRef[];
  completedTreatmentProgramInstanceRefs: ExerciseUsageRef[];
  activePatientLfkAssignmentRefs: ExerciseUsageRef[];
};

export const EMPTY_EXERCISE_USAGE_SNAPSHOT: ExerciseUsageSnapshot = {
  publishedLfkComplexTemplateCount: 0,
  draftLfkComplexTemplateCount: 0,
  activePatientLfkAssignmentCount: 0,
  publishedTreatmentProgramTemplateCount: 0,
  draftTreatmentProgramTemplateCount: 0,
  activeTreatmentProgramInstanceCount: 0,
  completedTreatmentProgramInstanceCount: 0,
  publishedLfkComplexTemplateRefs: [],
  draftLfkComplexTemplateRefs: [],
  publishedTreatmentProgramTemplateRefs: [],
  draftTreatmentProgramTemplateRefs: [],
  activeTreatmentProgramInstanceRefs: [],
  completedTreatmentProgramInstanceRefs: [],
  activePatientLfkAssignmentRefs: [],
};

/** Требуется явное подтверждение архивации (см. ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN). */
export function exerciseArchiveRequiresAcknowledgement(u: ExerciseUsageSnapshot): boolean {
  return (
    u.publishedLfkComplexTemplateCount > 0 ||
    u.activePatientLfkAssignmentCount > 0 ||
    u.publishedTreatmentProgramTemplateCount > 0 ||
    u.activeTreatmentProgramInstanceCount > 0
  );
}

export type ArchiveExerciseOptions = {
  acknowledgeUsageWarning?: boolean;
};
