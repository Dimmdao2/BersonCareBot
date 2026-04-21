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
};

export type CreateRecommendationInput = {
  title: string;
  bodyMd: string;
  media?: RecommendationMediaItem[];
  tags?: string[] | null;
};

export type UpdateRecommendationInput = {
  title?: string;
  bodyMd?: string;
  media?: RecommendationMediaItem[] | null;
  tags?: string[] | null;
};
