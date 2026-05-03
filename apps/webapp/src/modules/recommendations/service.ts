import type { RecommendationsPort } from "./ports";
import {
  RecommendationArchiveAlreadyArchivedError,
  RecommendationArchiveNotFoundError,
  RecommendationUnarchiveNotArchivedError,
  RecommendationUsageConfirmationRequiredError,
} from "./errors";
import type {
  ArchiveRecommendationOptions,
  CreateRecommendationInput,
  RecommendationFilter,
  UpdateRecommendationInput,
} from "./types";
import { recommendationArchiveRequiresAcknowledgement } from "./types";

function normalizeOptionalCatalogText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t ? t : null;
}

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
          bodyRegionId: input.bodyRegionId?.trim() || null,
          quantityText: normalizeOptionalCatalogText(input.quantityText),
          frequencyText: normalizeOptionalCatalogText(input.frequencyText),
          durationText: normalizeOptionalCatalogText(input.durationText),
        },
        createdBy,
      );
    },

    async updateRecommendation(id: string, input: UpdateRecommendationInput) {
      const existing = await port.getById(id);
      if (!existing) throw new Error("Рекомендация не найдена");
      if (existing.isArchived) {
        throw new Error("Рекомендация в архиве. Верните из архива, чтобы редактировать.");
      }
      const patch: UpdateRecommendationInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название рекомендации обязательно");
        patch.title = t;
      }
      if (input.bodyMd !== undefined) {
        patch.bodyMd = input.bodyMd.trim();
      }
      if (input.bodyRegionId !== undefined) {
        patch.bodyRegionId = input.bodyRegionId?.trim() || null;
      }
      if (input.quantityText !== undefined) {
        patch.quantityText = normalizeOptionalCatalogText(input.quantityText);
      }
      if (input.frequencyText !== undefined) {
        patch.frequencyText = normalizeOptionalCatalogText(input.frequencyText);
      }
      if (input.durationText !== undefined) {
        patch.durationText = normalizeOptionalCatalogText(input.durationText);
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

    async unarchiveRecommendation(id: string) {
      const existing = await port.getById(id);
      if (!existing) throw new RecommendationArchiveNotFoundError();
      if (!existing.isArchived) throw new RecommendationUnarchiveNotArchivedError();

      const ok = await port.unarchive(id);
      if (!ok) throw new RecommendationArchiveNotFoundError();
    },
  };
}

export type RecommendationsService = ReturnType<typeof createRecommendationsService>;
