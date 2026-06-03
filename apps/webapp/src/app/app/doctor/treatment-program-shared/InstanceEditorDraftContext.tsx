"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { TreatmentProgramInstanceDetail, TreatmentProgramInstanceStatus } from "@/modules/treatment-program/types";
import {
  createEmptyInstanceEditorDraft,
  createInstanceEditorDraftClientId,
  hasInstanceEditorDraftFlushableChanges,
  isInstanceEditorDraftClientId,
  isInstanceEditorDraftDirty,
  itemCreateClientIds,
  mergeInstanceEditorDraftIntoDetail,
  normalizeInstanceEditorDraft,
  prepareInstanceEditorItemCreate,
  removeItemFromInstanceEditorItemCreates,
  type InstanceEditorDraft,
  type InstanceEditorGroupCreate,
  type InstanceEditorGroupPatch,
  type InstanceEditorItemCreateInput,
  type InstanceEditorItemLoadSettingsPatch,
  type InstanceEditorItemPatch,
  type InstanceEditorItemStructuralPatch,
  type InstanceEditorStageCreate,
  type InstanceEditorStageMetadataPatch,
} from "./instanceEditorDraft";
import { flushInstanceEditorDraft } from "./flushInstanceEditorDraft";

type InstanceEditorDraftContextValue = {
  programStatus: TreatmentProgramInstanceStatus;
  isDirty: boolean;
  /** Metadata-патчи, блокирующие status API до legacy flush (structural-only не блокирует). */
  isFlushableDirty: boolean;
  saving: boolean;
  displayDetail: TreatmentProgramInstanceDetail;
  patchStageMetadata: (stageId: string, patch: InstanceEditorStageMetadataPatch) => void;
  patchGroup: (groupId: string, patch: InstanceEditorGroupPatch) => void;
  patchItem: (itemId: string, patch: InstanceEditorItemPatch) => void;
  patchItemLoadSettings: (itemId: string, loadSettings: InstanceEditorItemLoadSettingsPatch) => void;
  patchItemLocalComment: (itemId: string, localComment: string | null) => void;
  setStageOrder: (orderedStageIds: string[]) => void;
  addStageCreate: (
    input: Omit<InstanceEditorStageCreate, "clientId"> & { clientId?: string },
  ) => string;
  addGroupCreate: (
    input: Omit<InstanceEditorGroupCreate, "clientId"> & { clientId?: string },
  ) => string;
  addItemCreate: (input: InstanceEditorItemCreateInput) => string[];
  deleteItem: (itemId: string) => void;
  hideGroup: (groupId: string) => void;
  setItemReorder: (stageId: string, orderedItemIds: string[]) => void;
  setGroupReorder: (stageId: string, orderedUserGroupIds: string[]) => void;
  patchItemStructural: (itemId: string, patch: InstanceEditorItemStructuralPatch) => void;
  discardDraft: () => void;
  saveDraft: () => Promise<{
    ok: boolean;
    error?: string;
    cancelled?: boolean;
  }>;
};

const InstanceEditorDraftContext = createContext<InstanceEditorDraftContextValue | null>(null);

export function InstanceEditorDraftProvider(props: {
  baseline: TreatmentProgramInstanceDetail;
  programStatus: TreatmentProgramInstanceStatus;
  onBaselineSynced: () => Promise<void>;
  children: ReactNode;
}) {
  const { baseline, programStatus, onBaselineSynced, children } = props;
  const [draft, setDraft] = useState<InstanceEditorDraft>(() => createEmptyInstanceEditorDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft((prev) => normalizeInstanceEditorDraft(prev, baseline));
  }, [baseline]);

  useEffect(() => {
    if (baseline.status === "completed") {
      setDraft(createEmptyInstanceEditorDraft());
    }
  }, [baseline.status]);

  const isDirty = isInstanceEditorDraftDirty(draft, baseline);
  const isFlushableDirty = hasInstanceEditorDraftFlushableChanges(draft, baseline);
  const displayDetail = useMemo(
    () => mergeInstanceEditorDraftIntoDetail(baseline, draft),
    [baseline, draft],
  );

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const mergeDraft = useCallback(
    (updater: (prev: InstanceEditorDraft) => InstanceEditorDraft) => {
      setDraft((prev) => normalizeInstanceEditorDraft(updater(prev), baseline));
    },
    [baseline],
  );

  const patchStageMetadata = useCallback(
    (stageId: string, patch: InstanceEditorStageMetadataPatch) => {
      mergeDraft((prev) => ({
        ...prev,
        stageMetadata: { ...prev.stageMetadata, [stageId]: { ...prev.stageMetadata[stageId], ...patch } },
      }));
    },
    [mergeDraft],
  );

  const patchGroup = useCallback(
    (groupId: string, patch: InstanceEditorGroupPatch) => {
      mergeDraft((prev) => ({
        ...prev,
        groupPatches: { ...prev.groupPatches, [groupId]: { ...prev.groupPatches[groupId], ...patch } },
      }));
    },
    [mergeDraft],
  );

  const patchItem = useCallback(
    (itemId: string, patch: InstanceEditorItemPatch) => {
      mergeDraft((prev) => ({
        ...prev,
        itemPatches: { ...prev.itemPatches, [itemId]: { ...prev.itemPatches[itemId], ...patch } },
      }));
    },
    [mergeDraft],
  );

  const patchItemLoadSettings = useCallback(
    (itemId: string, loadSettings: InstanceEditorItemLoadSettingsPatch) => {
      patchItem(itemId, { loadSettings });
    },
    [patchItem],
  );

  const patchItemLocalComment = useCallback(
    (itemId: string, localComment: string | null) => {
      patchItem(itemId, { localComment });
    },
    [patchItem],
  );

  const setStageOrder = useCallback(
    (orderedStageIds: string[]) => {
      mergeDraft((prev) => ({ ...prev, stageOrder: orderedStageIds }));
    },
    [mergeDraft],
  );

  const addStageCreate = useCallback(
    (input: Omit<InstanceEditorStageCreate, "clientId"> & { clientId?: string }) => {
      const clientId = input.clientId ?? createInstanceEditorDraftClientId();
      mergeDraft((prev) => ({
        ...prev,
        stageCreates: [...prev.stageCreates, { ...input, clientId }],
      }));
      return clientId;
    },
    [mergeDraft],
  );

  const addGroupCreate = useCallback(
    (input: Omit<InstanceEditorGroupCreate, "clientId"> & { clientId?: string }) => {
      const clientId = input.clientId ?? createInstanceEditorDraftClientId();
      mergeDraft((prev) => ({
        ...prev,
        groupCreates: [...prev.groupCreates, { ...input, clientId }],
      }));
      return clientId;
    },
    [mergeDraft],
  );

  const addItemCreate = useCallback(
    (input: InstanceEditorItemCreateInput) => {
      const prepared = prepareInstanceEditorItemCreate(input);
      mergeDraft((prev) => ({
        ...prev,
        itemCreates: [...prev.itemCreates, prepared],
      }));
      return itemCreateClientIds(prepared);
    },
    [mergeDraft],
  );

  const deleteItem = useCallback(
    (itemId: string) => {
      mergeDraft((prev) => {
        const itemCreates = removeItemFromInstanceEditorItemCreates(prev.itemCreates, itemId);
        const { [itemId]: _itemPatch, ...itemPatches } = prev.itemPatches;
        const { [itemId]: _structPatch, ...itemStructuralPatches } = prev.itemStructuralPatches;
        const itemDeletes = isInstanceEditorDraftClientId(itemId)
          ? prev.itemDeletes
          : { ...prev.itemDeletes, [itemId]: true as const };
        return { ...prev, itemCreates, itemPatches, itemStructuralPatches, itemDeletes };
      });
    },
    [mergeDraft],
  );

  const hideGroup = useCallback(
    (groupId: string) => {
      mergeDraft((prev) => {
        if (isInstanceEditorDraftClientId(groupId)) {
          const { [groupId]: _groupPatch, ...groupPatches } = prev.groupPatches;
          return {
            ...prev,
            groupCreates: prev.groupCreates.filter((g) => g.clientId !== groupId),
            groupPatches,
            itemCreates: prev.itemCreates.filter((create) => {
              if (create.kind === "library_item" && create.groupId === groupId) return false;
              if (create.kind === "lfk_complex_expand" && create.groupId === groupId) return false;
              return true;
            }),
          };
        }
        return { ...prev, groupHides: { ...prev.groupHides, [groupId]: true as const } };
      });
    },
    [mergeDraft],
  );

  const setItemReorder = useCallback(
    (stageId: string, orderedItemIds: string[]) => {
      mergeDraft((prev) => ({
        ...prev,
        itemReorders: { ...prev.itemReorders, [stageId]: orderedItemIds },
      }));
    },
    [mergeDraft],
  );

  const setGroupReorder = useCallback(
    (stageId: string, orderedUserGroupIds: string[]) => {
      mergeDraft((prev) => ({
        ...prev,
        groupReorders: { ...prev.groupReorders, [stageId]: orderedUserGroupIds },
      }));
    },
    [mergeDraft],
  );

  const patchItemStructural = useCallback(
    (itemId: string, patch: InstanceEditorItemStructuralPatch) => {
      mergeDraft((prev) => ({
        ...prev,
        itemStructuralPatches: {
          ...prev.itemStructuralPatches,
          [itemId]: { ...prev.itemStructuralPatches[itemId], ...patch },
        },
      }));
    },
    [mergeDraft],
  );

  const discardDraft = useCallback(() => {
    setDraft(createEmptyInstanceEditorDraft());
  }, []);

  const saveDraft = useCallback(async () => {
    if (!isInstanceEditorDraftDirty(draft, baseline)) return { ok: true };

    setSaving(true);
    try {
      const result = await flushInstanceEditorDraft({
        instanceId: baseline.id,
        programStatus,
        draft,
        baseline,
      });
      if (!result.ok) {
        if (result.cancelled) return { ok: false, cancelled: true };
        return { ok: false, error: result.error };
      }
      setDraft(createEmptyInstanceEditorDraft());
      await onBaselineSynced();
      return { ok: true };
    } finally {
      setSaving(false);
    }
  }, [baseline, draft, onBaselineSynced, programStatus]);

  const value = useMemo(
    (): InstanceEditorDraftContextValue => ({
      programStatus,
      isDirty,
      isFlushableDirty,
      saving,
      displayDetail,
      patchStageMetadata,
      patchGroup,
      patchItem,
      patchItemLoadSettings,
      patchItemLocalComment,
      setStageOrder,
      addStageCreate,
      addGroupCreate,
      addItemCreate,
      deleteItem,
      hideGroup,
      setItemReorder,
      setGroupReorder,
      patchItemStructural,
      discardDraft,
      saveDraft,
    }),
    [
      programStatus,
      isDirty,
      isFlushableDirty,
      saving,
      displayDetail,
      patchStageMetadata,
      patchGroup,
      patchItem,
      patchItemLoadSettings,
      patchItemLocalComment,
      setStageOrder,
      addStageCreate,
      addGroupCreate,
      addItemCreate,
      deleteItem,
      hideGroup,
      setItemReorder,
      setGroupReorder,
      patchItemStructural,
      discardDraft,
      saveDraft,
    ],
  );

  return <InstanceEditorDraftContext.Provider value={value}>{children}</InstanceEditorDraftContext.Provider>;
}

export function useInstanceEditorDraft(): InstanceEditorDraftContextValue {
  const ctx = useContext(InstanceEditorDraftContext);
  if (!ctx) {
    throw new Error("useInstanceEditorDraft must be used within InstanceEditorDraftProvider");
  }
  return ctx;
}

/** Опциональный доступ — для компонентов вне провайдера (тесты). */
export function useOptionalInstanceEditorDraft(): InstanceEditorDraftContextValue | null {
  return useContext(InstanceEditorDraftContext);
}
