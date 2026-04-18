import type {
  Recommendation,
  RecommendationFilter,
  CreateRecommendationInput,
  UpdateRecommendationInput,
} from "./types";

export type RecommendationsPort = {
  list(filter: RecommendationFilter): Promise<Recommendation[]>;
  getById(id: string): Promise<Recommendation | null>;
  create(input: CreateRecommendationInput, createdBy: string | null): Promise<Recommendation>;
  update(id: string, input: UpdateRecommendationInput): Promise<Recommendation | null>;
  archive(id: string): Promise<boolean>;
};
