import type { MediaPreviewStatus } from '@/modules/media/types';
import type { RecommendationListFilterScope } from '@/shared/lib/doctorCatalogListStatus';

import { mergeCatalogBodyRegionIds } from '@/shared/lib/mergeCatalogBodyRegionIds';

/** Код из справочника `load_type` (`reference_items`); не ограничивать union — админка добавляет значения. */
export type ExerciseLoadType = string;

/**
 * `hosted_video` — ссылка на внешний хостинг (YouTube/RuTube/VK Видео/Vimeo), а не файл медиатеки:
 * строки `media_files` за ней нет, конвертации и своей миниатюры не будет, показ — через iframe
 * (`shared/lib/hostingEmbedUrls.ts`). Остальные три всегда означают `/api/media/{uuid}`.
 */
export type ExerciseMediaType = 'image' | 'video' | 'gif' | 'hosted_video';
export type ExerciseOwnerKind = 'organization' | 'platform';
export type ExerciseCatalogScope = 'catalog' | 'personal';

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
  ownerKind: ExerciseOwnerKind;
  catalogScope: ExerciseCatalogScope;
  title: string;
  description: string | null;
  /** Первый регион (legacy колонка `region_ref_id`, dual-write с M2M). */
  regionRefId: string | null;
  /** Все регионы (M2M `lfk_exercise_regions` ∪ legacy). */
  regionRefIds: readonly string[];
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
  /** Trusted server-side entitlement decision; never derive from a request query/body. */
  includePlatformBase?: boolean;
};

export type ExerciseAccessOptions = {
  /** Trusted server-side entitlement decision; defaults to own organization only. */
  includePlatformBase?: boolean;
};

export const mergeExerciseRegionRefIds = mergeCatalogBodyRegionIds;

export type ExerciseMediaInput = {
  mediaUrl: string;
  mediaType: ExerciseMediaType;
  sortOrder?: number;
};

export type CreateExerciseInput = {
  title: string;
  description?: string | null;
  regionRefId?: string | null;
  /** Регионы тела (M2M); при сохранении `region_ref_id` = первый id. */
  regionRefIds?: string[] | null;
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
  regionRefIds?: string[] | null;
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
  | { kind: 'lfk_complex_template' | 'treatment_program_template'; id: string; title: string }
  | {
      kind: 'treatment_program_instance' | 'patient_lfk_assignment_client';
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
