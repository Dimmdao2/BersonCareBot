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
  isInstanceEditorDraftDirty,
  mergeInstanceEditorDraftIntoDetail,
  normalizeInstanceEditorDraft,
  type InstanceEditorDraft,
  type InstanceEditorGroupPatch,
  type InstanceEditorItemLoadSettingsPatch,
  type InstanceEditorItemPatch,
  type InstanceEditorStageMetadataPatch,
} from "./instanceEditorDraft";
import { flushInstanceEditorDraft } from "./flushInstanceEditorDraft";

type InstanceEditorDraftContextValue = {
  programStatus: TreatmentProgramInstanceStatus;
  isDirty: boolean;
  saving: boolean;
  displayDetail: TreatmentProgramInstanceDetail;
  patchStageMetadata: (stageId: string, patch: InstanceEditorStageMetadataPatch) => void;
  patchGroup: (groupId: string, patch: InstanceEditorGroupPatch) => void;
  patchItem: (itemId: string, patch: InstanceEditorItemPatch) => void;
  patchItemLoadSettings: (itemId: string, loadSettings: InstanceEditorItemLoadSettingsPatch) => void;
  patchItemLocalComment: (itemId: string, localComment: string | null) => void;
  discardDraft: () => void;
  saveDraft: () => Promise<{ ok: boolean; error?: string; cancelled?: boolean; partial?: boolean }>;
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
        if (result.partial) {
          await onBaselineSynced();
        }
        return { ok: false, error: result.error, partial: result.partial };
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
      saving,
      displayDetail,
      patchStageMetadata,
      patchGroup,
      patchItem,
      patchItemLoadSettings,
      patchItemLocalComment,
      discardDraft,
      saveDraft,
    }),
    [
      programStatus,
      isDirty,
      saving,
      displayDetail,
      patchStageMetadata,
      patchGroup,
      patchItem,
      patchItemLoadSettings,
      patchItemLocalComment,
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
