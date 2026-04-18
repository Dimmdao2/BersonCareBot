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

export type RecommendationFilter = {
  includeArchived?: boolean;
  search?: string | null;
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
