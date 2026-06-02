import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyInstanceEditorDraft } from "./instanceEditorDraft";
import { flushInstanceEditorDraft } from "./flushInstanceEditorDraft";
import type { TreatmentProgramInstanceDetail } from "@/modules/treatment-program/types";

vi.mock("./programInstanceMutationGuard", () => ({
  confirmActiveProgramInstanceBatchSave: vi.fn(() => true),
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
        groups: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            stageId: "22222222-2222-4222-8222-222222222222",
            title: "Группа",
            description: null,
            scheduleText: null,
            sortOrder: 0,
            systemKind: null,
            sourceGroupId: null,
          },
        ],
        items: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            stageId: "22222222-2222-4222-8222-222222222222",
            itemType: "exercise" as const,
            itemRefId: "55555555-5555-4555-8555-555555555555",
            sortOrder: 0,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: { title: "Упр" },
            completedAt: null,
            isActionable: null,
            status: "active" as const,
            groupId: "33333333-3333-4333-8333-333333333333",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastViewedAt: null,
            effectiveComment: null,
          },
        ],
      },
    ],
  };
}

describe("flushInstanceEditorDraft", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns ok when draft has no real changes", async () => {
    const baseline = minimalDetail();
    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        stageMetadata: {
          "22222222-2222-4222-8222-222222222222": { title: "Этап 1" },
        },
      },
      baseline,
    });
    expect(result).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns ok without fetch when only structural draft sections are dirty", async () => {
    const baseline = minimalDetail();
    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        stageOrder: ["22222222-2222-4222-8222-222222222222"],
        itemStructuralPatches: {
          "44444444-4444-4444-8444-444444444444": { status: "disabled" },
        },
      },
      baseline,
    });
    expect(result).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("PATCHes only changed fields", async () => {
    const baseline = minimalDetail();
    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        stageMetadata: {
          "22222222-2222-4222-8222-222222222222": { title: "Новый этап" },
        },
        groupPatches: {
          "33333333-3333-4333-8333-333333333333": { title: "Новая группа" },
        },
        itemPatches: {
          "44444444-4444-4444-8444-444444444444": { localComment: "Коммент" },
        },
      },
      baseline,
    });
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns partial when a later PATCH fails", async () => {
    const baseline = minimalDetail();
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return { ok: true, json: async () => ({ ok: true }) };
        }
        return { ok: false, json: async () => ({ ok: false, error: "fail" }) };
      }),
    );

    const result = await flushInstanceEditorDraft({
      instanceId: baseline.id,
      programStatus: "active",
      draft: {
        ...createEmptyInstanceEditorDraft(),
        stageMetadata: {
          "22222222-2222-4222-8222-222222222222": { title: "Новый этап" },
        },
        groupPatches: {
          "33333333-3333-4333-8333-333333333333": { title: "Новая группа" },
        },
      },
      baseline,
    });
    expect(result).toEqual({ ok: false, error: "fail", partial: true });
  });
});
