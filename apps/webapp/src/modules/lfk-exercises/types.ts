import type { MediaPreviewStatus } from "@/modules/media/types";

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
};

export const EMPTY_EXERCISE_USAGE_SNAPSHOT: ExerciseUsageSnapshot = {
  publishedLfkComplexTemplateCount: 0,
  draftLfkComplexTemplateCount: 0,
  activePatientLfkAssignmentCount: 0,
  publishedTreatmentProgramTemplateCount: 0,
  draftTreatmentProgramTemplateCount: 0,
  activeTreatmentProgramInstanceCount: 0,
  completedTreatmentProgramInstanceCount: 0,
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
