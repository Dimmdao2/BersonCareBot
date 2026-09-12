import type {
  Recommendation,
  RecommendationAccessOptions,
  RecommendationFilter,
  CreateRecommendationInput,
  UpdateRecommendationInput,
  RecommendationUsageSnapshot,
} from './types';

export type RecommendationsPort = {
  list(filter: RecommendationFilter): Promise<Recommendation[]>;
  getById(id: string, options?: RecommendationAccessOptions): Promise<Recommendation | null>;
  create(input: CreateRecommendationInput, createdBy: string | null): Promise<Recommendation>;
  update(id: string, input: UpdateRecommendationInput): Promise<Recommendation | null>;
  archive(id: string): Promise<boolean>;
  unarchive(id: string): Promise<boolean>;
  getRecommendationUsageSummary(id: string): Promise<RecommendationUsageSnapshot>;
};
