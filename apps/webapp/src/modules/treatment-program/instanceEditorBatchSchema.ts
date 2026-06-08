import { z } from "zod";
import { TREATMENT_PROGRAM_ITEM_TYPES } from "./types";

/** Client draft id (`draft:` + uuid) or persisted uuid. */
export const instanceEditorBatchIdSchema = z.union([
  z.string().uuid(),
  z.string().regex(/^draft:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
]);

const stageMetadataPatchSchema = z
  .object({
    title: z.string().optional(),
    description: z.union([z.string(), z.null()]).optional(),
    goals: z.union([z.string(), z.null()]).optional(),
    objectives: z.union([z.string(), z.null()]).optional(),
    expectedDurationDays: z.union([z.number().int(), z.null()]).optional(),
    expectedDurationText: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

const groupPatchSchema = z
  .object({
    title: z.string().optional(),
    description: z.union([z.string(), z.null()]).optional(),
    scheduleText: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

const loadSettingsPatchSchema = z
  .object({
    reps: z.union([z.number(), z.null()]),
    sets: z.union([z.number(), z.null()]),
    maxPain: z.union([z.number(), z.null()]),
  })
  .strict();

const itemPatchSchema = z
  .object({
    localComment: z.union([z.string(), z.null()]).optional(),
    loadSettings: loadSettingsPatchSchema.optional(),
  })
  .strict();

const stageCreateSchema = z
  .object({
    clientId: instanceEditorBatchIdSchema,
    title: z.string().min(1).max(2000),
    description: z.union([z.string(), z.null()]).optional(),
    goals: z.union([z.string(), z.null()]).optional(),
    objectives: z.union([z.string(), z.null()]).optional(),
    expectedDurationDays: z.union([z.number().int(), z.null()]).optional(),
    expectedDurationText: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

const groupCreateSchema = z
  .object({
    clientId: instanceEditorBatchIdSchema,
    stageId: instanceEditorBatchIdSchema,
    title: z.string().min(1).max(2000),
    description: z.union([z.string(), z.null()]).optional(),
    scheduleText: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

const itemStructuralPatchSchema = z
  .object({
    groupId: instanceEditorBatchIdSchema.nullable().optional(),
    isActionable: z.boolean().nullable().optional(),
    status: z.enum(["active", "disabled"]).optional(),
    replace: z
      .object({
        itemType: z.enum(TREATMENT_PROGRAM_ITEM_TYPES),
        itemRefId: z.string().uuid(),
        snapshot: z.record(z.string(), z.unknown()),
      })
      .optional(),
  })
  .strict();

const libraryItemCreateSchema = z
  .object({
    kind: z.literal("library_item"),
    clientId: instanceEditorBatchIdSchema,
    stageId: instanceEditorBatchIdSchema,
    itemType: z.enum(TREATMENT_PROGRAM_ITEM_TYPES),
    itemRefId: z.string().uuid(),
    groupId: instanceEditorBatchIdSchema.nullable().optional(),
    snapshot: z.record(z.string(), z.unknown()),
    localComment: z.union([z.string(), z.null()]).optional(),
    loadSettings: loadSettingsPatchSchema.optional(),
    isActionable: z.boolean().nullable().optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict();

const freeformCreateSchema = z
  .object({
    kind: z.literal("freeform_recommendation"),
    clientId: instanceEditorBatchIdSchema,
    stageId: instanceEditorBatchIdSchema,
    title: z.string().min(1).max(2000),
    bodyMd: z.string(),
    snapshot: z.record(z.string(), z.unknown()),
    localComment: z.union([z.string(), z.null()]).optional(),
    isActionable: z.boolean().nullable().optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict();

const expandLineSchema = z
  .object({
    clientId: instanceEditorBatchIdSchema,
    itemRefId: z.string().uuid(),
    snapshot: z.record(z.string(), z.unknown()),
    localComment: z.union([z.string(), z.null()]).optional(),
    loadSettings: loadSettingsPatchSchema.optional(),
    groupId: instanceEditorBatchIdSchema.nullable().optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict();

const testSetExpandSchema = z
  .object({
    kind: z.literal("test_set_expand"),
    stageId: instanceEditorBatchIdSchema,
    testSetId: z.string().uuid(),
    items: z.array(expandLineSchema).min(1),
  })
  .strict();

const lfkComplexExpandSchema = z
  .object({
    kind: z.literal("lfk_complex_expand"),
    stageId: instanceEditorBatchIdSchema,
    groupId: instanceEditorBatchIdSchema,
    complexTemplateId: z.string().uuid(),
    items: z.array(expandLineSchema).min(1),
  })
  .strict();

const itemCreateSchema = z.discriminatedUnion("kind", [
  libraryItemCreateSchema,
  freeformCreateSchema,
  testSetExpandSchema,
  lfkComplexExpandSchema,
]);

export const instanceEditorBatchDraftSchema = z
  .object({
    stageMetadata: z.record(z.string(), stageMetadataPatchSchema).default({}),
    groupPatches: z.record(z.string(), groupPatchSchema).default({}),
    itemPatches: z.record(z.string(), itemPatchSchema).default({}),
    stageOrder: z.array(instanceEditorBatchIdSchema).nullable().default(null),
    stageCreates: z.array(stageCreateSchema).default([]),
    groupCreates: z.array(groupCreateSchema).default([]),
    itemCreates: z.array(itemCreateSchema).default([]),
    itemDeletes: z.record(z.string(), z.literal(true)).default({}),
    itemReorders: z.record(z.string(), z.array(instanceEditorBatchIdSchema)).default({}),
    groupReorders: z.record(z.string(), z.array(instanceEditorBatchIdSchema)).default({}),
    groupHides: z.record(z.string(), z.literal(true)).default({}),
    itemStructuralPatches: z.record(z.string(), itemStructuralPatchSchema).default({}),
  })
  .strict();

export const instanceEditorBatchBodySchema = z
  .object({
    draft: instanceEditorBatchDraftSchema,
  })
  .strict();

export type InstanceEditorBatchDraft = z.infer<typeof instanceEditorBatchDraftSchema>;

export type ProgramChangedDiff = {
  stagesAdded: number;
  stagesReordered: boolean;
  groupsAdded: number;
  groupsHidden: number;
  groupsMetadataUpdated: number;
  stagesMetadataUpdated: number;
  itemsAdded: number;
  itemsRemoved: number;
  itemsStructuralUpdated: number;
  itemsMetadataUpdated: number;
  itemsReordered: boolean;
  groupsReordered: boolean;
};

export function createEmptyProgramChangedDiff(): ProgramChangedDiff {
  return {
    stagesAdded: 0,
    stagesReordered: false,
    groupsAdded: 0,
    groupsHidden: 0,
    groupsMetadataUpdated: 0,
    stagesMetadataUpdated: 0,
    itemsAdded: 0,
    itemsRemoved: 0,
    itemsStructuralUpdated: 0,
    itemsMetadataUpdated: 0,
    itemsReordered: false,
    groupsReordered: false,
  };
}

export function isProgramChangedDiffEmpty(diff: ProgramChangedDiff): boolean {
  return (
    diff.stagesAdded === 0 &&
    !diff.stagesReordered &&
    diff.groupsAdded === 0 &&
    diff.groupsHidden === 0 &&
    diff.groupsMetadataUpdated === 0 &&
    diff.stagesMetadataUpdated === 0 &&
    diff.itemsAdded === 0 &&
    diff.itemsRemoved === 0 &&
    diff.itemsStructuralUpdated === 0 &&
    diff.itemsMetadataUpdated === 0 &&
    !diff.itemsReordered &&
    !diff.groupsReordered
  );
}

export function isInstanceEditorBatchDraftEmpty(draft: InstanceEditorBatchDraft): boolean {
  return (
    Object.keys(draft.stageMetadata).length === 0 &&
    Object.keys(draft.groupPatches).length === 0 &&
    Object.keys(draft.itemPatches).length === 0 &&
    draft.stageOrder === null &&
    draft.stageCreates.length === 0 &&
    draft.groupCreates.length === 0 &&
    draft.itemCreates.length === 0 &&
    Object.keys(draft.itemDeletes).length === 0 &&
    Object.keys(draft.itemReorders).length === 0 &&
    Object.keys(draft.groupReorders).length === 0 &&
    Object.keys(draft.groupHides).length === 0 &&
    Object.keys(draft.itemStructuralPatches).length === 0
  );
}
