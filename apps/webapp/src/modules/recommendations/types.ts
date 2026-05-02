import type { RecommendationDomain } from "./recommendationDomain";

export type RecommendationMediaItem = {
  mediaUrl: string;
  mediaType: "image" | "video" | "gif";
  sortOrder: number;
};

export type Recommendation = {
  id: string;
  title: string;
  bodyMd: string;
  media: RecommendationMediaItem[];
  tags: string[] | null;
  /** Область контента (каталог врача). */
  domain: RecommendationDomain | null;
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
  /** Зарезервировано под единый UI с упражнениями; список в БД пока не фильтрует. */
  regionRefId?: string | null;
  /** Зарезервировано под единый UI с упражнениями; список в БД пока не фильтрует. */
  loadType?: import("@/modules/lfk-exercises/types").ExerciseLoadType | null;
  /** Фильтр по области рекомендации (`recommendationDomain`). */
  domain?: RecommendationDomain | null;
};

export type CreateRecommendationInput = {
  title: string;
  bodyMd: string;
  media?: RecommendationMediaItem[];
  tags?: string[] | null;
  domain?: RecommendationDomain | null;
};

export type UpdateRecommendationInput = {
  title?: string;
  bodyMd?: string;
  media?: RecommendationMediaItem[] | null;
  tags?: string[] | null;
  domain?: RecommendationDomain | null;
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
