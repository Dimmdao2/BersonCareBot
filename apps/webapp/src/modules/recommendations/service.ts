import type { ReferencesPort } from "@/modules/references/ports";
import type { RecommendationsPort } from "./ports";
import {
  RecommendationArchiveAlreadyArchivedError,
  RecommendationArchiveNotFoundError,
  RecommendationInvalidDomainError,
  RecommendationUnarchiveNotArchivedError,
  RecommendationUsageConfirmationRequiredError,
} from "./errors";
import {
  RECOMMENDATION_TYPE_CATEGORY_CODE,
  recommendationDomainWriteAllowSet,
} from "./recommendationDomain";
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

type RecommendationDomainWriteContext =
  | { kind: "create" }
  | { kind: "update"; existingDomain: string | null };

async function assertRecommendationDomainWritePayload(
  references: ReferencesPort,
  input: CreateRecommendationInput | UpdateRecommendationInput,
  ctx: RecommendationDomainWriteContext,
): Promise<void> {
  if (input.domain === undefined) return;
  const normalized = input.domain === null ? null : input.domain.trim() || null;
  const t = normalized === null ? "" : normalized;
  if (!t) return;
  const unchangedFromRow = ctx.kind === "update" && (ctx.existingDomain ?? "").trim() === t;
  if (unchangedFromRow) return;
  const refItems = await references.listActiveItemsByCategoryCode(RECOMMENDATION_TYPE_CATEGORY_CODE);
  const allow = recommendationDomainWriteAllowSet(refItems);
  if (!allow.has(t)) {
    throw new RecommendationInvalidDomainError();
  }
}

export function createRecommendationsService(port: RecommendationsPort, references: ReferencesPort) {
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
      const domainForCreate =
        input.domain === undefined ? undefined : input.domain === null ? null : input.domain.trim() || null;
      await assertRecommendationDomainWritePayload(
        references,
        { ...input, domain: domainForCreate },
        { kind: "create" },
      );
      const basePayload = {
        ...input,
        title,
        bodyMd,
        bodyRegionId: input.bodyRegionId?.trim() || null,
        quantityText: normalizeOptionalCatalogText(input.quantityText),
        frequencyText: normalizeOptionalCatalogText(input.frequencyText),
        durationText: normalizeOptionalCatalogText(input.durationText),
      };
      return port.create(
        input.domain === undefined ? basePayload : { ...basePayload, domain: domainForCreate },
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
      if (input.domain !== undefined) {
        patch.domain = input.domain === null ? null : input.domain.trim() || null;
      }
      await assertRecommendationDomainWritePayload(references, patch, {
        kind: "update",
        existingDomain: existing.domain,
      });
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
