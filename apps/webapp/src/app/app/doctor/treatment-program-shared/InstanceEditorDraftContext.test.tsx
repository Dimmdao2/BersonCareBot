/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";
import {
  InstanceEditorDraftProvider,
  useInstanceEditorDraft,
} from "./InstanceEditorDraftContext";
import { createInstanceEditorDraftClientId, createEmptyInstanceEditorDraft, isInstanceEditorDraftDirty } from "./instanceEditorDraft";

vi.mock("./flushInstanceEditorDraft", () => ({
  flushInstanceEditorDraft: vi.fn(async () => ({ ok: true as const })),
}));

function minimalDetail(): TreatmentProgramInstanceDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    patientUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    templateId: null,
    title: "План",
    status: "active",
    assignmentSource: "doctor",
    assignedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        instanceId: "11111111-1111-4111-8111-111111111111",
        sourceStageId: null,
        title: "Этап 1",
        description: null,
        sortOrder: 1,
        status: "available",
        skipReason: null,
        localComment: null,
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [],
      },
    ],
  };
}

function wrapper(baseline: TreatmentProgramInstanceDetail, onBaselineSynced = vi.fn(async () => {})) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <InstanceEditorDraftProvider
        baseline={baseline}
        programStatus="active"
        onBaselineSynced={onBaselineSynced}
      >
        {children}
      </InstanceEditorDraftProvider>
    );
  };
}

describe("InstanceEditorDraftContext", () => {
  it("structural draft methods update displayDetail and stay dirty after metadata flush", async () => {
    const baseline = minimalDetail();
    const { result } = renderHook(() => useInstanceEditorDraft(), { wrapper: wrapper(baseline) });

    const stageId = createInstanceEditorDraftClientId();
    act(() => {
      result.current.addStageCreate({ clientId: stageId, title: "Draft stage" });
      result.current.patchStageMetadata("22222222-2222-4222-8222-222222222222", { title: "Renamed" });
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.displayDetail.stages.some((s) => s.id === stageId)).toBe(true);
    expect(result.current.displayDetail.stages[0]?.title).toBe("Renamed");

    await act(async () => {
      await result.current.saveDraft();
    });

    await waitFor(() => {
      expect(result.current.displayDetail.stages.some((s) => s.id === stageId)).toBe(true);
      expect(result.current.isDirty).toBe(true);
    });
    expect(result.current.displayDetail.stages[0]?.title).toBe("Этап 1");
  });

  it("setStageOrder and patchItemStructural are exposed", () => {
    const baseline = minimalDetail();
    const { result } = renderHook(() => useInstanceEditorDraft(), { wrapper: wrapper(baseline) });

    act(() => {
      result.current.setStageOrder(["22222222-2222-4222-8222-222222222222"]);
    });
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.deleteItem("00000000-0000-4000-8000-000000000000");
    });
    expect(result.current.isDirty).toBe(false);
  });

  it("discardDraft clears structural sections", () => {
    const baseline = minimalDetail();
    const { result } = renderHook(() => useInstanceEditorDraft(), { wrapper: wrapper(baseline) });

    act(() => {
      result.current.addStageCreate({ title: "X" });
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.discardDraft();
    });
    expect(result.current.isDirty).toBe(false);
    expect(result.current.displayDetail).toEqual(baseline);
  });

  it("saveDraft with structural-only returns structuralPending", async () => {
    const baseline = minimalDetail();
    const { result } = renderHook(() => useInstanceEditorDraft(), { wrapper: wrapper(baseline) });

    act(() => {
      result.current.addStageCreate({ title: "Draft stage" });
    });

    expect(result.current.isFlushableDirty).toBe(false);

    let saveResult: Awaited<ReturnType<typeof result.current.saveDraft>> | undefined;
    await act(async () => {
      saveResult = await result.current.saveDraft();
    });

    expect(saveResult).toEqual({ ok: false, structuralPending: true });
  });

  it("hideGroup marks draft dirty", () => {
    const baseline = minimalDetail();
    baseline.stages[0]!.groups.push({
      id: "44444444-4444-4444-8444-444444444444",
      stageId: baseline.stages[0]!.id,
      sourceGroupId: null,
      title: "Группа",
      description: null,
      scheduleText: null,
      sortOrder: 0,
      systemKind: null,
    });
    const { result } = renderHook(() => useInstanceEditorDraft(), { wrapper: wrapper(baseline) });

    act(() => {
      result.current.hideGroup("44444444-4444-4444-8444-444444444444");
    });
    expect(result.current.isDirty).toBe(true);
    expect(
      result.current.displayDetail.stages[0]!.groups.some(
        (g) => g.id === "44444444-4444-4444-8444-444444444444",
      ),
    ).toBe(false);
  });

  it("addItemCreate and metadata patches update displayDetail without fetch", () => {
    const baseline = minimalDetail();
    const itemId = "55555555-5555-4555-8555-555555555555";
    baseline.stages[0]!.items.push({
      id: itemId,
      stageId: baseline.stages[0]!.id,
      itemType: "exercise",
      itemRefId: "ex-ref",
      sortOrder: 0,
      comment: null,
      localComment: null,
      settings: null,
      snapshot: { title: "Упр" },
      completedAt: null,
      isActionable: null,
      status: "active",
      groupId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastViewedAt: null,
      effectiveComment: null,
    });
    const { result } = renderHook(() => useInstanceEditorDraft(), { wrapper: wrapper(baseline) });
    const stageId = baseline.stages[0]!.id;

    act(() => {
      result.current.addGroupCreate({ stageId, title: "Новая группа" });
      result.current.addItemCreate({
        kind: "library_item",
        stageId,
        itemType: "recommendation",
        itemRefId: "rec-1",
        snapshot: { title: "Рек из каталога" },
      });
      result.current.patchItemLocalComment(itemId, "Коммент врача");
      result.current.patchItemLoadSettings(itemId, { reps: 10, sets: 2, maxPain: 3 });
    });

    const stage = result.current.displayDetail.stages[0]!;
    expect(stage.groups.some((g) => g.title === "Новая группа")).toBe(true);
    expect(stage.items.some((it) => it.snapshot.title === "Рек из каталога")).toBe(true);
    const patched = stage.items.find((it) => it.id === itemId);
    expect(patched?.localComment).toBe("Коммент врача");
    expect(patched?.settings).toMatchObject({ reps: 10, sets: 2, maxPain: 3 });
    expect(result.current.isDirty).toBe(true);
  });
});

describe("isInstanceEditorDraftDirty integration", () => {
  it("stage create alone is dirty", () => {
    const baseline = minimalDetail();
    const draft = createEmptyInstanceEditorDraft();
    draft.stageCreates.push({ clientId: createInstanceEditorDraftClientId(), title: "S" });
    expect(isInstanceEditorDraftDirty(draft, baseline)).toBe(true);
  });
});
