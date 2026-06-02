import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageGroup,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageItemView,
} from "@/modules/treatment-program/types";
import { effectiveInstanceStageItemComment } from "@/modules/treatment-program/types";

export type InstanceEditorStageMetadataPatch = {
  title?: string;
  description?: string | null;
  goals?: string | null;
  objectives?: string | null;
  expectedDurationDays?: number | null;
  expectedDurationText?: string | null;
};

export type InstanceEditorGroupPatch = {
  title?: string;
  description?: string | null;
  scheduleText?: string | null;
};

export type InstanceEditorItemLoadSettingsPatch = {
  reps: number | null;
  sets: number | null;
  maxPain: number | null;
};

export type InstanceEditorItemPatch = {
  localComment?: string | null;
  loadSettings?: InstanceEditorItemLoadSettingsPatch;
};

export type InstanceEditorDraft = {
  stageMetadata: Record<string, InstanceEditorStageMetadataPatch>;
  groupPatches: Record<string, InstanceEditorGroupPatch>;
  itemPatches: Record<string, InstanceEditorItemPatch>;
};

export function createEmptyInstanceEditorDraft(): InstanceEditorDraft {
  return { stageMetadata: {}, groupPatches: {}, itemPatches: {} };
}

export function isInstanceEditorDraftEmpty(draft: InstanceEditorDraft): boolean {
  return (
    Object.keys(draft.stageMetadata).length === 0 &&
    Object.keys(draft.groupPatches).length === 0 &&
    Object.keys(draft.itemPatches).length === 0
  );
}

function pickFirstFiniteNum(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/** Сравнимое с UI чтение нагрузки упражнения из baseline. */
export function readInstanceItemLoadSettingsPatch(
  item: TreatmentProgramInstanceStageItemRow,
): InstanceEditorItemLoadSettingsPatch {
  if (item.itemType !== "exercise") {
    return { reps: null, sets: null, maxPain: null };
  }
  const ov =
    item.settings != null && typeof item.settings === "object" && !Array.isArray(item.settings)
      ? (item.settings as Record<string, unknown>)
      : {};
  const snap = item.snapshot;
  return {
    reps: pickFirstFiniteNum(ov.reps, snap.reps),
    sets: pickFirstFiniteNum(ov.sets, snap.sets),
    maxPain: pickFirstFiniteNum(ov.maxPain, snap.maxPain, snap.difficulty),
  };
}

function loadSettingsEqual(
  a: InstanceEditorItemLoadSettingsPatch,
  b: InstanceEditorItemLoadSettingsPatch,
): boolean {
  return a.reps === b.reps && a.sets === b.sets && a.maxPain === b.maxPain;
}

function findStage(baseline: TreatmentProgramInstanceDetail, stageId: string) {
  return baseline.stages.find((s) => s.id === stageId) ?? null;
}

type InstanceEditorStageNode = TreatmentProgramInstanceDetail["stages"][number];

function findGroup(stage: InstanceEditorStageNode, groupId: string) {
  return stage.groups.find((g) => g.id === groupId) ?? null;
}

function findItem(baseline: TreatmentProgramInstanceDetail, itemId: string) {
  for (const st of baseline.stages) {
    const item = st.items.find((i) => i.id === itemId);
    if (item) return item;
  }
  return null;
}

function stageMetadataPatchDiffers(
  stage: InstanceEditorStageNode,
  patch: InstanceEditorStageMetadataPatch,
): boolean {
  if (patch.title !== undefined && patch.title !== stage.title) return true;
  if (patch.description !== undefined && patch.description !== stage.description) return true;
  if (patch.goals !== undefined && patch.goals !== stage.goals) return true;
  if (patch.objectives !== undefined && patch.objectives !== stage.objectives) return true;
  if (patch.expectedDurationDays !== undefined && patch.expectedDurationDays !== stage.expectedDurationDays) {
    return true;
  }
  if (patch.expectedDurationText !== undefined && patch.expectedDurationText !== stage.expectedDurationText) {
    return true;
  }
  return false;
}

function groupPatchDiffers(
  group: TreatmentProgramInstanceStageGroup,
  patch: InstanceEditorGroupPatch,
): boolean {
  if (patch.title !== undefined && patch.title !== group.title) return true;
  if (patch.description !== undefined && patch.description !== group.description) return true;
  if (patch.scheduleText !== undefined && patch.scheduleText !== group.scheduleText) return true;
  return false;
}

function itemPatchDiffers(
  item: TreatmentProgramInstanceStageItemRow,
  patch: InstanceEditorItemPatch,
): boolean {
  if (patch.localComment !== undefined) {
    const next = normalizeNullableText(patch.localComment);
    const base = normalizeNullableText(item.localComment);
    if (next !== base) return true;
  }
  if (patch.loadSettings) {
    const baseLoad = readInstanceItemLoadSettingsPatch(item);
    if (!loadSettingsEqual(patch.loadSettings, baseLoad)) return true;
  }
  return false;
}

/** Убрать патчи, совпадающие с baseline (ложный dirty / no-op blur). */
export function normalizeInstanceEditorDraft(
  draft: InstanceEditorDraft,
  baseline: TreatmentProgramInstanceDetail,
): InstanceEditorDraft {
  const next = createEmptyInstanceEditorDraft();

  for (const [stageId, patch] of Object.entries(draft.stageMetadata)) {
    const stage = findStage(baseline, stageId);
    if (stage && stageMetadataPatchDiffers(stage, patch)) {
      next.stageMetadata[stageId] = patch;
    }
  }

  for (const [groupId, patch] of Object.entries(draft.groupPatches)) {
    for (const st of baseline.stages) {
      const group = findGroup(st, groupId);
      if (group && groupPatchDiffers(group, patch)) {
        next.groupPatches[groupId] = patch;
        break;
      }
    }
  }

  for (const [itemId, patch] of Object.entries(draft.itemPatches)) {
    const item = findItem(baseline, itemId);
    if (item && itemPatchDiffers(item, patch)) {
      next.itemPatches[itemId] = patch;
    }
  }

  return next;
}

export function isInstanceEditorDraftDirty(
  draft: InstanceEditorDraft,
  baseline: TreatmentProgramInstanceDetail,
): boolean {
  return !isInstanceEditorDraftEmpty(normalizeInstanceEditorDraft(draft, baseline));
}

function mergeItemSettings(
  settings: Record<string, unknown> | null,
  loadSettings: InstanceEditorItemLoadSettingsPatch,
): Record<string, unknown> {
  const base =
    settings != null && typeof settings === "object" && !Array.isArray(settings)
      ? { ...settings }
      : {};
  base.reps = loadSettings.reps;
  base.sets = loadSettings.sets;
  base.maxPain = loadSettings.maxPain;
  return base;
}

function mergeItemRow(
  item: TreatmentProgramInstanceStageItemView,
  patch: InstanceEditorItemPatch | undefined,
): TreatmentProgramInstanceStageItemView {
  if (!patch) return item;
  let next: TreatmentProgramInstanceStageItemRow = item;
  if (patch.localComment !== undefined) {
    next = { ...next, localComment: patch.localComment };
  }
  if (patch.loadSettings) {
    next = {
      ...next,
      settings: mergeItemSettings(next.settings, patch.loadSettings),
    };
  }
  return {
    ...next,
    effectiveComment: effectiveInstanceStageItemComment(next),
  };
}

/** Наложить черновик на серверное дерево для отображения в редакторе. */
export function mergeInstanceEditorDraftIntoDetail(
  detail: TreatmentProgramInstanceDetail,
  draft: InstanceEditorDraft,
): TreatmentProgramInstanceDetail {
  const normalized = normalizeInstanceEditorDraft(draft, detail);
  if (isInstanceEditorDraftEmpty(normalized)) return detail;

  return {
    ...detail,
    stages: detail.stages.map((stage) => {
      const stagePatch = normalized.stageMetadata[stage.id];
      const nextStage = stagePatch
        ? {
            ...stage,
            ...(stagePatch.title !== undefined ? { title: stagePatch.title } : {}),
            ...(stagePatch.description !== undefined ? { description: stagePatch.description } : {}),
            ...(stagePatch.goals !== undefined ? { goals: stagePatch.goals } : {}),
            ...(stagePatch.objectives !== undefined ? { objectives: stagePatch.objectives } : {}),
            ...(stagePatch.expectedDurationDays !== undefined
              ? { expectedDurationDays: stagePatch.expectedDurationDays }
              : {}),
            ...(stagePatch.expectedDurationText !== undefined
              ? { expectedDurationText: stagePatch.expectedDurationText }
              : {}),
          }
        : stage;

      const nextGroups = nextStage.groups.map((group) => {
        const groupPatch = normalized.groupPatches[group.id];
        if (!groupPatch) return group;
        return {
          ...group,
          ...(groupPatch.title !== undefined ? { title: groupPatch.title } : {}),
          ...(groupPatch.description !== undefined ? { description: groupPatch.description } : {}),
          ...(groupPatch.scheduleText !== undefined ? { scheduleText: groupPatch.scheduleText } : {}),
        };
      });

      const nextItems = nextStage.items.map((item) => mergeItemRow(item, normalized.itemPatches[item.id]));

      return { ...nextStage, groups: nextGroups, items: nextItems };
    }),
  };
}

/** Патчи, которые реально нужно отправить на сервер. */
export function pickInstanceEditorDraftChanges(
  draft: InstanceEditorDraft,
  baseline: TreatmentProgramInstanceDetail,
): InstanceEditorDraft {
  return normalizeInstanceEditorDraft(draft, baseline);
}
