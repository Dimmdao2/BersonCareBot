import type { InstanceEditorBatchDraft } from "@/modules/treatment-program/instanceEditorBatchSchema";
import type { InstanceEditorDraft } from "./instanceEditorDraft";

/**
 * Wire-format для POST editor-batch: каталожные снимки не передаём — сервер строит `buildSnapshot`.
 * In-memory `InstanceEditorDraft` по-прежнему держит preview-snapshot только для UI редактора.
 */
export function serializeInstanceEditorBatchDraftForApi(draft: InstanceEditorDraft): InstanceEditorBatchDraft {
  const itemCreates = draft.itemCreates.map((create) => {
    switch (create.kind) {
      case "library_item": {
        const { snapshot: _snapshot, ...rest } = create;
        return rest;
      }
      case "freeform_recommendation": {
        const { snapshot: _snapshot, ...rest } = create;
        return rest;
      }
      case "test_set_expand":
      case "lfk_complex_expand":
        return {
          ...create,
          items: create.items.map(({ snapshot: _snapshot, ...line }) => line),
        };
    }
  });

  const itemStructuralPatches: InstanceEditorBatchDraft["itemStructuralPatches"] = {};
  for (const [itemId, patch] of Object.entries(draft.itemStructuralPatches)) {
    if (!patch.replace) {
      itemStructuralPatches[itemId] = patch;
      continue;
    }
    const { snapshot: _snapshot, ...replace } = patch.replace;
    itemStructuralPatches[itemId] = { ...patch, replace };
  }

  return {
    stageMetadata: draft.stageMetadata,
    groupPatches: draft.groupPatches,
    itemPatches: draft.itemPatches,
    stageOrder: draft.stageOrder,
    stageCreates: draft.stageCreates,
    groupCreates: draft.groupCreates,
    itemCreates,
    itemDeletes: draft.itemDeletes,
    itemReorders: draft.itemReorders,
    groupReorders: draft.groupReorders,
    groupHides: draft.groupHides,
    itemStructuralPatches,
  };
}
