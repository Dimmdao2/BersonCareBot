import type { RecommendationsPort } from "./ports";
import {
  RecommendationArchiveAlreadyArchivedError,
  RecommendationArchiveNotFoundError,
  RecommendationUsageConfirmationRequiredError,
} from "./errors";
import type {
  ArchiveRecommendationOptions,
  CreateRecommendationInput,
  RecommendationFilter,
  UpdateRecommendationInput,
} from "./types";
import { recommendationArchiveRequiresAcknowledgement } from "./types";

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

    async getRecommendationUsage(recommendationId: string) {
      return port.getRecommendationUsageSummary(recommendationId);
    },

    async archiveRecommendation(id: string, options?: ArchiveRecommendationOptions) {
      const existing = await port.getById(id);
      if (!existing) throw new RecommendationArchiveNotFoundError();
      if (existing.isArchived) throw new RecommendationArchiveAlreadyArchivedError();

      const usage = await port.getRecommendationUsageSummary(id);
      if (recommendationArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new RecommendationUsageConfirmationRequiredError(usage);
      }

      const ok = await port.archive(id);
      if (!ok) throw new RecommendationArchiveNotFoundError();
    },
  };
}

export type RecommendationsService = ReturnType<typeof createRecommendationsService>;
