import type { MediaPreviewStatus } from "@/modules/media/types";
import type { RecommendationDomain } from "./recommendationDomain";

export type RecommendationMediaItem = {
  mediaUrl: string;
  mediaType: "image" | "video" | "gif";
  sortOrder: number;
  /** Превью воркера для малого размера; в JSON рекомендации в БД может отсутствовать — подставляется при `buildSnapshot`. */
  previewSmUrl?: string | null;
  previewMdUrl?: string | null;
  previewStatus?: MediaPreviewStatus | null;
};

export type Recommendation = {
  id: string;
  title: string;
  bodyMd: string;
  media: RecommendationMediaItem[];
  tags: string[] | null;
  /** Тип (колонка БД `domain`); может быть legacy-строкой вне справочника на чтении. */
  domain: RecommendationDomain | null;
  /** Регион тела (`reference_items`, категория `body_region`); первый = legacy `body_region_id`. */
  bodyRegionId: string | null;
  /** Все регионы (M2M ∪ legacy). */
  bodyRegionIds: readonly string[];
  quantityText: string | null;
  frequencyText: string | null;
  durationText: string | null;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Фильтр по архиву в списке (как у наборов тестов). */
export type RecommendationArchiveScope = "active" | "all" | "archived";

export type RecommendationFilter = {
  /** @deprecated Используйте {@link archiveScope}. */
  includeArchived?: boolean;
  archiveScope?: RecommendationArchiveScope;
  search?: string | null;
  /** Фильтр по региону тела (`body_region_id`). */
  regionRefId?: string | null;
  loadType?: import("@/modules/lfk-exercises/types").ExerciseLoadType | null;
  /** Фильтр по типу (`domain` в БД). */
  domain?: RecommendationDomain | null;
};

export type CreateRecommendationInput = {
  title: string;
  bodyMd: string;
  media?: RecommendationMediaItem[];
  tags?: string[] | null;
  domain?: RecommendationDomain | null;
  bodyRegionId?: string | null;
  bodyRegionIds?: string[] | null;
  quantityText?: string | null;
  frequencyText?: string | null;
  durationText?: string | null;
};

export type UpdateRecommendationInput = {
  title?: string;
  bodyMd?: string;
  media?: RecommendationMediaItem[] | null;
  tags?: string[] | null;
  domain?: RecommendationDomain | null;
  bodyRegionId?: string | null;
  bodyRegionIds?: string[] | null;
  quantityText?: string | null;
  frequencyText?: string | null;
  durationText?: string | null;
};

/** См. `ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md` раздел 5 (Guard архива). */
export const RECOMMENDATION_USAGE_DETAIL_LIMIT = 12;

export type RecommendationUsageRef =
  | { kind: "treatment_program_template"; id: string; title: string }
  | { kind: "treatment_program_instance"; id: string; title: string; patientUserId: string };

export type RecommendationUsageSnapshot = {
  publishedTreatmentProgramTemplateCount: number;
  draftTreatmentProgramTemplateCount: number;
  archivedTreatmentProgramTemplateCount: number;
  activeTreatmentProgramInstanceCount: number;
  completedTreatmentProgramInstanceCount: number;
  publishedTreatmentProgramTemplateRefs: RecommendationUsageRef[];
  draftTreatmentProgramTemplateRefs: RecommendationUsageRef[];
  archivedTreatmentProgramTemplateRefs: RecommendationUsageRef[];
  activeTreatmentProgramInstanceRefs: RecommendationUsageRef[];
  completedTreatmentProgramInstanceRefs: RecommendationUsageRef[];
};

export const EMPTY_RECOMMENDATION_USAGE_SNAPSHOT: RecommendationUsageSnapshot = {
  publishedTreatmentProgramTemplateCount: 0,
  draftTreatmentProgramTemplateCount: 0,
  archivedTreatmentProgramTemplateCount: 0,
  activeTreatmentProgramInstanceCount: 0,
  completedTreatmentProgramInstanceCount: 0,
  publishedTreatmentProgramTemplateRefs: [],
  draftTreatmentProgramTemplateRefs: [],
  archivedTreatmentProgramTemplateRefs: [],
  activeTreatmentProgramInstanceRefs: [],
  completedTreatmentProgramInstanceRefs: [],
};

/** См. `ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md` раздел 5 (Guard архива). */
export function recommendationArchiveRequiresAcknowledgement(u: RecommendationUsageSnapshot): boolean {
  return u.publishedTreatmentProgramTemplateCount > 0 || u.activeTreatmentProgramInstanceCount > 0;
}

export type ArchiveRecommendationOptions = {
  acknowledgeUsageWarning?: boolean;
};
