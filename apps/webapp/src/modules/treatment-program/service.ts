import type { TreatmentProgramItemRefValidationPort, TreatmentProgramPort } from "./ports";
import {
  TreatmentProgramTemplateAlreadyArchivedError,
  TreatmentProgramTemplateArchiveNotFoundError,
  TreatmentProgramTemplateUsageConfirmationRequiredError,
} from "./errors";
import type {
  ArchiveTreatmentProgramTemplateOptions,
  CreateTreatmentProgramStageInput,
  CreateTreatmentProgramStageItemInput,
  CreateTreatmentProgramTemplateInput,
  TreatmentProgramItemType,
  TreatmentProgramTemplateFilter,
  UpdateTreatmentProgramStageInput,
  UpdateTreatmentProgramStageItemInput,
  UpdateTreatmentProgramTemplateInput,
} from "./types";
import { TREATMENT_PROGRAM_ITEM_TYPES, treatmentProgramTemplateArchiveRequiresAcknowledgement } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id: string): void {
  const t = id.trim();
  if (!UUID_RE.test(t)) throw new Error("Некорректный UUID");
}

function assertItemType(t: string): asserts t is TreatmentProgramItemType {
  if (!TREATMENT_PROGRAM_ITEM_TYPES.includes(t as TreatmentProgramItemType)) {
    throw new Error("Неизвестный тип элемента программы");
  }
}

export function createTreatmentProgramService(
  port: TreatmentProgramPort,
  itemRefs: TreatmentProgramItemRefValidationPort,
) {
  return {
    async listTemplates(filter: TreatmentProgramTemplateFilter = {}) {
      return port.listTemplates(filter);
    },

    async getTemplate(id: string) {
      assertUuid(id);
      const row = await port.getTemplateById(id);
      if (!row) throw new Error("Шаблон программы не найден");
      return row;
    },

    async createTemplate(input: CreateTreatmentProgramTemplateInput, createdBy: string | null) {
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название шаблона обязательно");
      return port.createTemplate(
        {
          ...input,
          title,
          description: input.description?.trim() ?? null,
        },
        createdBy,
      );
    },

    async updateTemplate(
      id: string,
      input: UpdateTreatmentProgramTemplateInput,
      options?: ArchiveTreatmentProgramTemplateOptions,
    ) {
      assertUuid(id);
      const patch: UpdateTreatmentProgramTemplateInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название шаблона обязательно");
        patch.title = t;
      }
      if (input.description !== undefined) {
        patch.description = input.description?.trim() ?? null;
      }

      if (input.status === "archived") {
        const existing = await port.getTemplateById(id);
        if (!existing) throw new TreatmentProgramTemplateArchiveNotFoundError();
        if (existing.status !== "archived") {
          const usage = await port.getTreatmentProgramTemplateUsageSummary(id);
          if (
            treatmentProgramTemplateArchiveRequiresAcknowledgement(usage) &&
            !options?.acknowledgeUsageWarning
          ) {
            throw new TreatmentProgramTemplateUsageConfirmationRequiredError(usage);
          }
        }
      }

      const row = await port.updateTemplate(id, patch);
      if (!row) throw new Error("Шаблон программы не найден");
      return row;
    },

    async getTreatmentProgramTemplateUsage(templateId: string) {
      assertUuid(templateId);
      return port.getTreatmentProgramTemplateUsageSummary(templateId);
    },

    async deleteTemplate(id: string, options?: ArchiveTreatmentProgramTemplateOptions) {
      assertUuid(id);
      const existing = await port.getTemplateById(id);
      if (!existing) throw new TreatmentProgramTemplateArchiveNotFoundError();
      if (existing.status === "archived") throw new TreatmentProgramTemplateAlreadyArchivedError();

      const usage = await port.getTreatmentProgramTemplateUsageSummary(id);
      if (treatmentProgramTemplateArchiveRequiresAcknowledgement(usage) && !options?.acknowledgeUsageWarning) {
        throw new TreatmentProgramTemplateUsageConfirmationRequiredError(usage);
      }

      const ok = await port.deleteTemplate(id);
      if (!ok) throw new TreatmentProgramTemplateArchiveNotFoundError();
    },

    async createStage(templateId: string, input: CreateTreatmentProgramStageInput) {
      assertUuid(templateId);
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название этапа обязательно");
      return port.createStage(templateId, {
        ...input,
        title,
        description: input.description?.trim() ?? null,
      });
    },

    async updateStage(stageId: string, input: UpdateTreatmentProgramStageInput) {
      assertUuid(stageId);
      const patch: UpdateTreatmentProgramStageInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new Error("Название этапа обязательно");
        patch.title = t;
      }
      if (input.description !== undefined) {
        patch.description = input.description?.trim() ?? null;
      }
      const row = await port.updateStage(stageId, patch);
      if (!row) throw new Error("Этап не найден");
      return row;
    },

    async deleteStage(stageId: string) {
      assertUuid(stageId);
      const ok = await port.deleteStage(stageId);
      if (!ok) throw new Error("Этап не найден");
    },

    async addStageItem(stageId: string, input: CreateTreatmentProgramStageItemInput) {
      assertUuid(stageId);
      assertItemType(input.itemType);
      assertUuid(input.itemRefId);
      await itemRefs.assertItemRefExists(input.itemType, input.itemRefId.trim());
      return port.addStageItem(stageId, {
        ...input,
        itemRefId: input.itemRefId.trim(),
        comment: input.comment?.trim() ?? null,
      });
    },

    async updateStageItem(itemId: string, input: UpdateTreatmentProgramStageItemInput) {
      assertUuid(itemId);
      const patch: UpdateTreatmentProgramStageItemInput = { ...input };
      let typeForRef: TreatmentProgramItemType | undefined;
      if (input.itemType !== undefined) {
        assertItemType(input.itemType);
        patch.itemType = input.itemType;
        typeForRef = input.itemType;
      }
      if (input.itemRefId !== undefined) {
        assertUuid(input.itemRefId);
        patch.itemRefId = input.itemRefId.trim();
      }
      if (input.comment !== undefined) {
        patch.comment = input.comment?.trim() ?? null;
      }

      if (patch.itemRefId !== undefined || patch.itemType !== undefined) {
        const current = await port.getStageItemById(itemId);
        if (!current) throw new Error("Элемент этапа не найден");
        const nextType = patch.itemType ?? current.itemType;
        const nextRef = patch.itemRefId ?? current.itemRefId;
        await itemRefs.assertItemRefExists(nextType, nextRef);
      }

      const row = await port.updateStageItem(itemId, patch);
      if (!row) throw new Error("Элемент этапа не найден");
      return row;
    },

    async deleteStageItem(itemId: string) {
      assertUuid(itemId);
      const ok = await port.deleteStageItem(itemId);
      if (!ok) throw new Error("Элемент этапа не найден");
    },
  };
}

export type TreatmentProgramService = ReturnType<typeof createTreatmentProgramService>;
