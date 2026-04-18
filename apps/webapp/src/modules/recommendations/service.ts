import type { RecommendationsPort } from "./ports";
import type {
  CreateRecommendationInput,
  RecommendationFilter,
  UpdateRecommendationInput,
} from "./types";

export function createRecommendationsService(port: RecommendationsPort) {
  return {
    async listRecommendations(filter: RecommendationFilter = {}) {
      return port.list(filter);
    },

    async getRecommendation(id: string) {
      return port.getById(id);
    },

    async createRecommendation(input: CreateRecommendationInput, createdBy: string | null) {
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название рекомендации обязательно");
      const bodyMd = input.bodyMd?.trim() ?? "";
      return port.create(
        {
          ...input,
          title,
          bodyMd,
        },
        createdBy,
      );
    },

    async updateRecommendation(id: string, input: UpdateRecommendationInput) {
      const patch: UpdateRecommendationInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название рекомендации обязательно");
        patch.title = t;
      }
      if (input.bodyMd !== undefined) {
        patch.bodyMd = input.bodyMd.trim();
      }
      const row = await port.update(id, patch);
      if (!row) throw new Error("Рекомендация не найдена");
      return row;
    },

    async archiveRecommendation(id: string) {
      const ok = await port.archive(id);
      if (!ok) throw new Error("Рекомендация не найдена");
    },
  };
}

export type RecommendationsService = ReturnType<typeof createRecommendationsService>;
