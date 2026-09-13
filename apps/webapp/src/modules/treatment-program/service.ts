import type { TreatmentProgramItemRefValidationPort, TreatmentProgramPort } from './ports';
import {
  TreatmentProgramTemplateAlreadyArchivedError,
  TreatmentProgramTemplateArchiveNotFoundError,
  TreatmentProgramTemplateUsageConfirmationRequiredError,
  TreatmentProgramTemplateGroupDescriptionConflictError,
  TreatmentProgramExpandNotFoundError,
} from './errors';
import { assertTreatmentProgramStageItemFitsSystemGroup } from './stage-semantics';
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
} from './types';
import {
  TREATMENT_PROGRAM_ITEM_TYPES,
  treatmentProgramTemplateArchiveRequiresAcknowledgement,
} from './types';
import { UserFacingError } from '@/shared/errors/userFacingError';
import { notificationText } from '@/shared/notifications/notificationText';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id: string): void {
  const t = id.trim();
  if (!UUID_RE.test(t)) throw new UserFacingError(notificationText.commonInvalidUuid);
}

export type TreatmentProgramTemplateWriteOptions = {
  runTemplateWrite?: <T>(fn: () => Promise<T>) => Promise<T>;
};

function runTemplateWrite<T>(
  options: TreatmentProgramTemplateWriteOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return options?.runTemplateWrite ? options.runTemplateWrite(fn) : fn();
}

function assertItemType(t: string): asserts t is TreatmentProgramItemType {
  if (!TREATMENT_PROGRAM_ITEM_TYPES.includes(t as TreatmentProgramItemType)) {
    throw new UserFacingError(notificationText.treatmentProgramUnknownElementType);
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
      if (!row) throw new UserFacingError(notificationText.treatmentProgramTemplateNotFound);
      return row;
    },

    async createTemplate(
      input: CreateTreatmentProgramTemplateInput,
      createdBy: string | null,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      const title = input.title?.trim() ?? '';
      if (!title) throw new UserFacingError(notificationText.exerciseTemplateNameRequired);
      return runTemplateWrite(options, () =>
        port.createTemplate(
          {
            ...input,
            title,
            description: input.description?.trim() ?? null,
          },
          createdBy,
        ),
      );
    },

    async updateTemplate(
      id: string,
      input: UpdateTreatmentProgramTemplateInput,
      options?: ArchiveTreatmentProgramTemplateOptions,
      writeOptions?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(id);
      const patch: UpdateTreatmentProgramTemplateInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new UserFacingError(notificationText.exerciseTemplateNameRequired);
        patch.title = t;
      }
      if (input.description !== undefined) {
        patch.description = input.description?.trim() ?? null;
      }

      if (input.status === 'archived') {
        const existing = await port.getTemplateById(id);
        if (!existing) throw new TreatmentProgramTemplateArchiveNotFoundError();
        if (existing.status !== 'archived') {
          const usage = await port.getTreatmentProgramTemplateUsageSummary(id);
          if (
            treatmentProgramTemplateArchiveRequiresAcknowledgement(usage) &&
            !options?.acknowledgeUsageWarning
          ) {
            throw new TreatmentProgramTemplateUsageConfirmationRequiredError(usage);
          }
        }
      }

      const row = await runTemplateWrite(writeOptions, () => port.updateTemplate(id, patch));
      if (!row) throw new UserFacingError(notificationText.treatmentProgramTemplateNotFound);
      return row;
    },

    async getTreatmentProgramTemplateUsage(templateId: string) {
      assertUuid(templateId);
      return port.getTreatmentProgramTemplateUsageSummary(templateId);
    },

    async deleteTemplate(
      id: string,
      options?: ArchiveTreatmentProgramTemplateOptions,
      writeOptions?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(id);
      const existing = await port.getTemplateById(id);
      if (!existing) throw new TreatmentProgramTemplateArchiveNotFoundError();
      if (existing.status === 'archived') throw new TreatmentProgramTemplateAlreadyArchivedError();

      const usage = await port.getTreatmentProgramTemplateUsageSummary(id);
      if (
        treatmentProgramTemplateArchiveRequiresAcknowledgement(usage) &&
        !options?.acknowledgeUsageWarning
      ) {
        throw new TreatmentProgramTemplateUsageConfirmationRequiredError(usage);
      }

      const ok = await runTemplateWrite(writeOptions, () => port.deleteTemplate(id));
      if (!ok) throw new TreatmentProgramTemplateArchiveNotFoundError();
    },

    async createStage(
      templateId: string,
      input: CreateTreatmentProgramStageInput,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(templateId);
      const title = input.title?.trim() ?? '';
      if (!title) throw new UserFacingError(notificationText.treatmentProgramStageNameRequired);
      const goals =
        input.goals === undefined
          ? undefined
          : input.goals === null
            ? null
            : input.goals.trim() || null;
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
          throw new UserFacingError(
            notificationText.treatmentProgramExpectedDaysInvalid,
          );
        }
      }
      return runTemplateWrite(options, () =>
        port.createStage(templateId, {
          ...input,
          title,
          description: input.description?.trim() ?? null,
          goals,
          objectives,
          expectedDurationText,
          expectedDurationDays: input.expectedDurationDays,
        }),
      );
    },

    async updateStage(
      stageId: string,
      input: UpdateTreatmentProgramStageInput,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(stageId);
      const patch: UpdateTreatmentProgramStageInput = { ...input };
      if (input.title !== undefined) {
        const t = input.title.trim();
        if (!t) throw new UserFacingError(notificationText.treatmentProgramStageNameRequired);
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
          throw new UserFacingError(
            notificationText.treatmentProgramExpectedDaysInvalid,
          );
        }
      }
      const row = await runTemplateWrite(options, () => port.updateStage(stageId, patch));
      if (!row) throw new UserFacingError(notificationText.treatmentProgramStageNotFound);
      return row;
    },

    async deleteStage(stageId: string, options?: TreatmentProgramTemplateWriteOptions) {
      assertUuid(stageId);
      const ok = await runTemplateWrite(options, () => port.deleteStage(stageId));
      if (!ok) throw new UserFacingError(notificationText.treatmentProgramStageNotFound);
    },

    async addStageItem(
      stageId: string,
      input: CreateTreatmentProgramStageItemInput,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(stageId);
      assertItemType(input.itemType);
      assertUuid(input.itemRefId);
      if (input.groupId) assertUuid(input.groupId);
      const ctx = await port.getTemplateStageValidationContext(stageId);
      if (!ctx) throw new UserFacingError(notificationText.treatmentProgramStageNotFound);
      if (ctx.sortOrder === 0) {
        if (input.groupId) {
          throw new UserFacingError(
            notificationText.treatmentProgramGeneralStageNoGroupBinding,
          );
        }
        if (input.itemType !== 'recommendation') {
          throw new UserFacingError(notificationText.treatmentProgramGeneralStageRecommendationsOnly);
        }
      } else if (input.groupId) {
        const g = ctx.groups.find((x) => x.id === input.groupId);
        if (!g) throw new UserFacingError(notificationText.treatmentProgramGroupNotFoundOrWrongStage);
        assertTreatmentProgramStageItemFitsSystemGroup(g, input.itemType);
      }
      const hasGroup = Boolean(input.groupId);
      if (!hasGroup && input.itemType !== 'recommendation' && input.itemType !== 'clinical_test') {
        throw new UserFacingError(
          notificationText.treatmentProgramNoGroupAddRestriction,
        );
      }
      await itemRefs.assertItemRefExists(input.itemType, input.itemRefId.trim());
      return runTemplateWrite(options, () =>
        port.addStageItem(stageId, {
          ...input,
          itemRefId: input.itemRefId.trim(),
          comment: input.comment?.trim() ?? null,
        }),
      );
    },

    async updateStageItem(
      itemId: string,
      input: UpdateTreatmentProgramStageItemInput,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(itemId);
      const patch: UpdateTreatmentProgramStageItemInput = { ...input };
      if (input.itemType !== undefined) {
        assertItemType(input.itemType);
        patch.itemType = input.itemType;
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

      const currentRow = await port.getStageItemById(itemId);
      if (!currentRow) throw new UserFacingError(notificationText.treatmentProgramStageElementNotFound);

      if (patch.itemRefId !== undefined || patch.itemType !== undefined) {
        const nextType = patch.itemType ?? currentRow.itemType;
        const nextRef = patch.itemRefId ?? currentRow.itemRefId;
        await itemRefs.assertItemRefExists(nextType, nextRef);
      }

      const ctx = await port.getTemplateStageValidationContext(currentRow.stageId);
      if (!ctx) throw new UserFacingError(notificationText.treatmentProgramStageNotFound);
      const nextGroupId = patch.groupId !== undefined ? patch.groupId : currentRow.groupId;
      const nextType = patch.itemType ?? currentRow.itemType;
      if (ctx.sortOrder === 0) {
        if (nextType !== 'recommendation') {
          throw new UserFacingError(notificationText.treatmentProgramGeneralStageRecommendationsOnly);
        }
        if (nextGroupId != null) {
          throw new UserFacingError(
            notificationText.treatmentProgramGeneralStageNoGroupBinding,
          );
        }
      } else {
        if (nextGroupId) {
          const g = ctx.groups.find((x) => x.id === nextGroupId);
          if (!g) throw new UserFacingError(notificationText.treatmentProgramGroupNotFoundOrWrongStage);
          assertTreatmentProgramStageItemFitsSystemGroup(g, nextType);
        }
        if (!nextGroupId && nextType !== 'recommendation' && nextType !== 'clinical_test') {
          throw new UserFacingError(
            notificationText.treatmentProgramNoGroupKeepRestriction,
          );
        }
      }

      const row = await runTemplateWrite(options, () => port.updateStageItem(itemId, patch));
      if (!row) throw new UserFacingError(notificationText.treatmentProgramStageElementNotFound);
      return row;
    },

    async deleteStageItem(itemId: string, options?: TreatmentProgramTemplateWriteOptions) {
      assertUuid(itemId);
      const ok = await runTemplateWrite(options, () => port.deleteStageItem(itemId));
      if (!ok) throw new UserFacingError(notificationText.treatmentProgramStageElementNotFound);
    },

    async createTemplateStageGroup(
      stageId: string,
      input: CreateTreatmentProgramTemplateStageGroupInput,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(stageId);
      const title = input.title?.trim() ?? '';
      if (!title) throw new UserFacingError(notificationText.treatmentProgramGroupNameRequired);
      return runTemplateWrite(options, () =>
        port.createTemplateStageGroup(stageId, {
          ...input,
          title,
          description: input.description?.trim() ?? null,
          scheduleText: input.scheduleText?.trim() ?? null,
        }),
      );
    },

    async updateTemplateStageGroup(
      groupId: string,
      input: UpdateTreatmentProgramTemplateStageGroupInput,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
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
      const row = await runTemplateWrite(options, () =>
        port.updateTemplateStageGroup(groupId, patch),
      );
      if (!row) throw new UserFacingError(notificationText.treatmentProgramStageGroupNotFound);
      return row;
    },

    async deleteTemplateStageGroup(
      groupId: string,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(groupId);
      const ok = await runTemplateWrite(options, () => port.deleteTemplateStageGroup(groupId));
      if (!ok) throw new UserFacingError(notificationText.treatmentProgramStageGroupNotFound);
    },

    async reorderTemplateStageGroups(
      stageId: string,
      orderedGroupIds: string[],
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(stageId);
      for (const id of orderedGroupIds) assertUuid(id);
      const ok = await runTemplateWrite(options, () =>
        port.reorderTemplateStageGroups(stageId, orderedGroupIds),
      );
      if (!ok) throw new UserFacingError(notificationText.treatmentProgramInvalidStageGroupOrder);
    },

    async reorderTemplateStages(
      templateId: string,
      orderedStageIds: string[],
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(templateId);
      for (const id of orderedStageIds) assertUuid(id);
      const tpl = await port.getTemplateById(templateId);
      if (!tpl) throw new UserFacingError(notificationText.treatmentProgramTemplateNotFound);
      if (tpl.status === 'archived') throw new TreatmentProgramTemplateAlreadyArchivedError();
      const stageZero = tpl.stages.find((s) => s.sortOrder === 0);
      if (stageZero && orderedStageIds[0] !== stageZero.id) {
        throw new UserFacingError(notificationText.treatmentProgramGeneralStageMustStayFirst);
      }
      const ok = await runTemplateWrite(options, () =>
        port.reorderTemplateStages(templateId, orderedStageIds),
      );
      if (!ok) throw new UserFacingError(notificationText.treatmentProgramInvalidStageOrder);
    },

    async reorderTemplateStageItems(
      stageId: string,
      orderedItemIds: string[],
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(stageId);
      for (const id of orderedItemIds) assertUuid(id);
      const ctx = await port.getTemplateStageValidationContext(stageId);
      if (!ctx) throw new UserFacingError(notificationText.treatmentProgramStageNotFound);
      const tpl = await port.getTemplateById(ctx.templateId);
      if (!tpl) throw new UserFacingError(notificationText.treatmentProgramTemplateNotFound);
      if (tpl.status === 'archived') throw new TreatmentProgramTemplateAlreadyArchivedError();
      const ok = await runTemplateWrite(options, () =>
        port.reorderTemplateStageItems(stageId, orderedItemIds),
      );
      if (!ok) throw new UserFacingError(notificationText.treatmentProgramInvalidStageElementOrder);
    },

    async expandLfkComplexIntoTemplateStageItems(
      templateId: string,
      stageId: string,
      body: ExpandLfkComplexIntoStageItemsBody,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(templateId);
      assertUuid(stageId);
      assertUuid(body.complexTemplateId);

      const detail = await port.getTemplateById(templateId);
      if (!detail) throw new TreatmentProgramExpandNotFoundError('Шаблон программы не найден');
      if (detail.status === 'archived') throw new TreatmentProgramTemplateAlreadyArchivedError();

      const stage = detail.stages.find((s) => s.id === stageId);
      if (!stage) throw new TreatmentProgramExpandNotFoundError('Этап не найден');

      if (body.mode === 'new_group') {
        const title = body.newGroupTitle.trim();
        if (!title) throw new UserFacingError(notificationText.treatmentProgramGroupNameRequired);
      }
      if (body.mode === 'existing_group') {
        assertUuid(body.existingGroupId);
        const grp = stage.groups.find((g) => g.id === body.existingGroupId);
        if (!grp)
          throw new TreatmentProgramExpandNotFoundError(
            'Группа не найдена или не принадлежит этапу',
          );
        if (body.copyComplexDescriptionToGroup && (grp.description?.trim() ?? '')) {
          throw new TreatmentProgramTemplateGroupDescriptionConflictError();
        }
      }

      const preview = await port.getLfkComplexExpandPreview(body.complexTemplateId.trim());
      if (!preview)
        throw new TreatmentProgramExpandNotFoundError('Комплекс ЛФК не найден или в архиве');
      if (preview.exerciseIds.length === 0) throw new UserFacingError(notificationText.exerciseComplexEmpty);

      for (const id of preview.exerciseIds) {
        await itemRefs.assertItemRefExists('exercise', id);
      }

      return runTemplateWrite(options, () =>
        port.expandLfkComplexIntoStageItems({
          templateId,
          stageId,
          complexTemplateId: body.complexTemplateId.trim(),
          mode: body.mode,
          newGroupTitle: body.mode === 'new_group' ? body.newGroupTitle.trim() : undefined,
          existingGroupId: body.mode === 'existing_group' ? body.existingGroupId : undefined,
          copyComplexDescriptionToGroup: body.copyComplexDescriptionToGroup,
          expectedExerciseIds: preview.exerciseIds,
        }),
      );
    },

    async expandTestSetIntoTemplateStageItems(
      templateId: string,
      stageId: string,
      testSetId: string,
      options?: TreatmentProgramTemplateWriteOptions,
    ) {
      assertUuid(templateId);
      assertUuid(stageId);
      assertUuid(testSetId);
      const detail = await port.getTemplateById(templateId);
      if (!detail) throw new TreatmentProgramExpandNotFoundError('Шаблон программы не найден');
      if (detail.status === 'archived') throw new TreatmentProgramTemplateAlreadyArchivedError();
      const stage = detail.stages.find((s) => s.id === stageId);
      if (!stage) throw new TreatmentProgramExpandNotFoundError('Этап не найден');
      return runTemplateWrite(options, () =>
        port.expandTestSetIntoTemplateStageItems({
          templateId,
          stageId,
          testSetId: testSetId.trim(),
        }),
      );
    },

    async getLfkComplexExpandPreview(complexTemplateId: string) {
      assertUuid(complexTemplateId);
      return port.getLfkComplexExpandPreview(complexTemplateId.trim());
    },
  };
}

export type TreatmentProgramService = ReturnType<typeof createTreatmentProgramService>;
