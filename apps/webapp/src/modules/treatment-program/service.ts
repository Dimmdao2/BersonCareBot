import type { TreatmentProgramItemRefValidationPort, TreatmentProgramPort } from "./ports";
import {
  TreatmentProgramTemplateAlreadyArchivedError,
  TreatmentProgramTemplateArchiveNotFoundError,
  TreatmentProgramTemplateUsageConfirmationRequiredError,
  TreatmentProgramTemplateGroupDescriptionConflictError,
  TreatmentProgramExpandNotFoundError,
} from "./errors";
import type {
  ArchiveTreatmentProgramTemplateOptions,
  CreateTreatmentProgramStageInput,
  CreateTreatmentProgramStageItemInput,
  CreateTreatmentProgramTemplateInput,
  CreateTreatmentProgramTemplateStageGroupInput,
  ExpandLfkComplexIntoStageItemsBody,
  TreatmentProgramItemType,
  TreatmentProgramTemplateFilter,
  UpdateTreatmentProgramStageInput,
  UpdateTreatmentProgramStageItemInput,
  UpdateTreatmentProgramTemplateInput,
  UpdateTreatmentProgramTemplateStageGroupInput,
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
      const goals = input.goals === undefined ? undefined : input.goals === null ? null : input.goals.trim() || null;
      const objectives =
        input.objectives === undefined
          ? undefined
          : input.objectives === null
            ? null
            : input.objectives.trim() || null;
      const expectedDurationText =
        input.expectedDurationText === undefined
          ? undefined
          : input.expectedDurationText === null
            ? null
            : input.expectedDurationText.trim() || null;
      if (input.expectedDurationDays !== undefined && input.expectedDurationDays !== null) {
        if (!Number.isInteger(input.expectedDurationDays) || input.expectedDurationDays < 0) {
          throw new Error("Ожидаемый срок в днях должен быть неотрицательным целым числом");
        }
      }
      return port.createStage(templateId, {
        ...input,
        title,
        description: input.description?.trim() ?? null,
        goals,
        objectives,
        expectedDurationText,
        expectedDurationDays: input.expectedDurationDays,
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
      if (input.goals !== undefined) {
        patch.goals = input.goals === null ? null : input.goals.trim() || null;
      }
      if (input.objectives !== undefined) {
        patch.objectives = input.objectives === null ? null : input.objectives.trim() || null;
      }
      if (input.expectedDurationText !== undefined) {
        patch.expectedDurationText =
          input.expectedDurationText === null ? null : input.expectedDurationText.trim() || null;
      }
      if (input.expectedDurationDays !== undefined && input.expectedDurationDays !== null) {
        if (!Number.isInteger(input.expectedDurationDays) || input.expectedDurationDays < 0) {
          throw new Error("Ожидаемый срок в днях должен быть неотрицательным целым числом");
        }
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
      if (input.groupId) assertUuid(input.groupId);
      const hasGroup = Boolean(input.groupId);
      if (!hasGroup && input.itemType !== "recommendation" && input.itemType !== "test_set") {
        throw new Error("Без группы можно добавить только рекомендацию или набор тестов");
      }
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
      if (input.groupId !== undefined && input.groupId !== null) {
        assertUuid(input.groupId);
      }

      if (patch.itemRefId !== undefined || patch.itemType !== undefined) {
        const current = await port.getStageItemById(itemId);
        if (!current) throw new Error("Элемент этапа не найден");
        const nextType = patch.itemType ?? current.itemType;
        const nextRef = patch.itemRefId ?? current.itemRefId;
        await itemRefs.assertItemRefExists(nextType, nextRef);
      }

      const currentRow = await port.getStageItemById(itemId);
      if (!currentRow) throw new Error("Элемент этапа не найден");
      const nextGroupId = patch.groupId !== undefined ? patch.groupId : currentRow.groupId;
      const nextType = patch.itemType ?? currentRow.itemType;
      if (!nextGroupId && nextType !== "recommendation" && nextType !== "test_set") {
        throw new Error("Без группы можно оставить только рекомендацию или набор тестов");
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

    async createTemplateStageGroup(stageId: string, input: CreateTreatmentProgramTemplateStageGroupInput) {
      assertUuid(stageId);
      const title = input.title?.trim() ?? "";
      if (!title) throw new Error("Название группы обязательно");
      return port.createTemplateStageGroup(stageId, {
        ...input,
        title,
        description: input.description?.trim() ?? null,
        scheduleText: input.scheduleText?.trim() ?? null,
      });
    },

    async updateTemplateStageGroup(groupId: string, input: UpdateTreatmentProgramTemplateStageGroupInput) {
      assertUuid(groupId);
      const patch: UpdateTreatmentProgramTemplateStageGroupInput = { ...input };
      if (input.title !== undefined) {
        patch.title = input.title.trim();
      }
      if (input.description !== undefined) {
        patch.description = input.description?.trim() ?? null;
      }
      if (input.scheduleText !== undefined) {
        patch.scheduleText = input.scheduleText?.trim() ?? null;
      }
      const row = await port.updateTemplateStageGroup(groupId, patch);
      if (!row) throw new Error("Группа этапа не найдена");
      return row;
    },

    async deleteTemplateStageGroup(groupId: string) {
      assertUuid(groupId);
      const ok = await port.deleteTemplateStageGroup(groupId);
      if (!ok) throw new Error("Группа этапа не найдена");
    },

    async reorderTemplateStageGroups(stageId: string, orderedGroupIds: string[]) {
      assertUuid(stageId);
      for (const id of orderedGroupIds) assertUuid(id);
      const ok = await port.reorderTemplateStageGroups(stageId, orderedGroupIds);
      if (!ok) throw new Error("Некорректный порядок групп этапа");
    },

    async expandLfkComplexIntoTemplateStageItems(
      templateId: string,
      stageId: string,
      body: ExpandLfkComplexIntoStageItemsBody,
    ) {
      assertUuid(templateId);
      assertUuid(stageId);
      assertUuid(body.complexTemplateId);

      const detail = await port.getTemplateById(templateId);
      if (!detail) throw new TreatmentProgramExpandNotFoundError("Шаблон программы не найден");
      if (detail.status === "archived") throw new TreatmentProgramTemplateAlreadyArchivedError();

      const stage = detail.stages.find((s) => s.id === stageId);
      if (!stage) throw new TreatmentProgramExpandNotFoundError("Этап не найден");

      if (body.mode === "new_group") {
        const title = body.newGroupTitle.trim();
        if (!title) throw new Error("Название группы обязательно");
      }
      if (body.mode === "existing_group") {
        assertUuid(body.existingGroupId);
        const grp = stage.groups.find((g) => g.id === body.existingGroupId);
        if (!grp) throw new TreatmentProgramExpandNotFoundError("Группа не найдена или не принадлежит этапу");
        if (body.copyComplexDescriptionToGroup && (grp.description?.trim() ?? "")) {
          throw new TreatmentProgramTemplateGroupDescriptionConflictError();
        }
      }

      const preview = await port.getLfkComplexExpandPreview(body.complexTemplateId.trim());
      if (!preview) throw new TreatmentProgramExpandNotFoundError("Комплекс ЛФК не найден или в архиве");
      if (preview.exerciseIds.length === 0) throw new Error("В комплексе нет упражнений");

      for (const id of preview.exerciseIds) {
        await itemRefs.assertItemRefExists("exercise", id);
      }

      return port.expandLfkComplexIntoStageItems({
        templateId,
        stageId,
        complexTemplateId: body.complexTemplateId.trim(),
        mode: body.mode,
        newGroupTitle: body.mode === "new_group" ? body.newGroupTitle.trim() : undefined,
        existingGroupId: body.mode === "existing_group" ? body.existingGroupId : undefined,
        copyComplexDescriptionToGroup: body.copyComplexDescriptionToGroup,
        expectedExerciseIds: preview.exerciseIds,
      });
    },
  };
}

export type TreatmentProgramService = ReturnType<typeof createTreatmentProgramService>;
